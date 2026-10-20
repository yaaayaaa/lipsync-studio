import { applyEyes, blinkSpec } from '../character/eyes'
import type { BlinkSpec } from '../character/eyes'
import { applyMouth, resolveMouthLayer } from '../character/mouth'
import { VOWELS } from '../character/types'
import type { Character, ExportSettings, EyeState, Vowel } from '../character/types'
import { eyeSchedule } from '../lipsync/blink'
import { mouthAt } from '../lipsync/timeline'
import type { MouthTimeline } from '../lipsync/timeline'
import { composeTo } from '../psd/compose'
import type { LayerNode, VisibilityState } from '../psd/types'

export const FPS = 30

type Size = { width: number; height: number }

/**
 * 各フレームの口。フレーム数は ceil((max(タイムラインの長さ, minDuration) + tailSeconds) * fps)、
 * i 番目は区間の中央 (i+0.5)/fps の口。タイムラインより後のフレームは closed。
 * minDuration には音声の長さを渡す：映像が音声より先に終わると、編集ソフトで重ねたときに
 * 声だけ残って立ち絵が消えるため。tailSeconds は喋り終わったあと立ち絵を映し続ける秒数。
 */
export function frameSchedule(
  timeline: MouthTimeline,
  fps: number = FPS,
  minDuration = 0,
  tailSeconds = 0,
): Vowel[] {
  const duration = Math.max(timeline.duration, minDuration) + tailSeconds
  // 浮動小数の誤差（例: 1.0000000000000002 * 30）で1フレーム増えないよう微小量を引く
  const count = Math.ceil(duration * fps - 1e-9)
  return Array.from({ length: Math.max(0, count) }, (_, i) => mouthAt(timeline, (i + 0.5) / fps))
}

/** 立ち絵を動画の中央に置く矩形。高さ = 動画の高さ × scale、幅は PSD の縦横比のまま。 */
export function placement(settings: ExportSettings, psdSize: Size) {
  const height = Math.round(settings.height * settings.scale)
  const width = Math.round((psdSize.width * height) / psdSize.height)
  return {
    x: Math.round((settings.width - width) / 2),
    y: Math.round((settings.height - height) / 2),
    width,
    height,
  }
}

/** 1フレームの立ち絵を決めるもの：口と目 */
export interface FrameKey {
  vowel: Vowel
  eye: EyeState
}

/**
 * 口の予定に目の予定を重ねる。blink が null（瞬きしないキャラ）なら目は全部 open。
 * 目の予定は種とフレーム数だけで決まる（eyeSchedule）。
 */
export function lineFrameKeys(
  vowels: readonly Vowel[],
  blink: { seed: string; hasHalf: boolean } | null,
): FrameKey[] {
  const eyes = blink ? eyeSchedule(blink.seed, vowels.length, blink.hasHalf) : null
  return vowels.map((vowel, i) => ({ vowel, eye: eyes?.[i] ?? 'open' }))
}

/**
 * (口, 目) の組み合わせごとの立ち絵（PSD サイズ）。使う組み合わせだけを合成して覚えておく。
 * 口 7 種 × 開き目が基本で、瞬きのある行を書き出すときに使う組み合わせだけ増える。
 * 画像の持ち主はこのオブジェクトで、close() で全部閉じる。
 */
export class FrameStore {
  /** 瞬きに使う目のレイヤー。null ならこのキャラは瞬きしない */
  readonly blink: BlinkSpec | null
  private readonly tree: LayerNode[]
  private readonly expression: VisibilityState
  private readonly character: Pick<Character, 'mouthGroupId' | 'mouthMap'>
  private readonly psdSize: Size
  private readonly bitmaps = new Map<string, ImageBitmap>()
  /** 合成中のもの。同時に prepare されても同じ組み合わせを二重に作らない */
  private readonly pending = new Map<string, Promise<void>>()
  private closed = false

  constructor(
    tree: LayerNode[],
    expression: VisibilityState,
    character: Pick<Character, 'mouthGroupId' | 'mouthMap' | 'eyeGroupId' | 'eyeMap'>,
    psdSize: Size,
  ) {
    this.tree = tree
    this.expression = expression
    this.character = { mouthGroupId: character.mouthGroupId, mouthMap: character.mouthMap }
    this.psdSize = psdSize
    this.blink = blinkSpec(character)
  }

  /** まだない組み合わせだけ合成して覚える。 */
  async prepare(keys: Iterable<FrameKey>): Promise<void> {
    const waits = new Set<Promise<void>>()
    for (const key of keys) {
      const id = this.idOf(key)
      if (this.bitmaps.has(id)) continue
      let wait = this.pending.get(id)
      if (!wait) {
        wait = this.compose(id, key).finally(() => this.pending.delete(id))
        this.pending.set(id, wait)
      }
      waits.add(wait)
    }
    await Promise.all(waits)
  }

  has(key: FrameKey): boolean {
    return this.bitmaps.has(this.idOf(key))
  }

  /** prepare 済みの組み合わせの画像。まだなら例外 */
  get(key: FrameKey): ImageBitmap {
    const bitmap = this.bitmaps.get(this.idOf(key))
    if (!bitmap) throw new Error(`口「${key.vowel}」・目「${key.eye}」の画像がありません`)
    return bitmap
  }

  close(): void {
    this.closed = true
    for (const bitmap of this.bitmaps.values()) bitmap.close()
    this.bitmaps.clear()
  }

  /**
   * 同じ絵になる組み合わせは1枚にまとめる：瞬きしないキャラは目を問わず open、
   * 半目が未割り当てなら half は closed と同じ絵。
   */
  private idOf({ vowel, eye }: FrameKey): string {
    const shown = this.blink === null ? 'open' : eye === 'half' && this.blink.half === null ? 'closed' : eye
    return `${vowel}:${shown}`
  }

  private async compose(id: string, { vowel, eye }: FrameKey): Promise<void> {
    if (this.closed) throw new Error('閉じた立ち絵の画像は作れません')
    const canvas = new OffscreenCanvas(this.psdSize.width, this.psdSize.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context を作れませんでした')
    const { mouthGroupId, mouthMap } = this.character
    const withMouth = applyMouth(this.tree, this.expression, mouthGroupId, resolveMouthLayer(mouthMap, vowel))
    composeTo(ctx, this.tree, applyEyes(this.tree, withMouth, this.blink, eye), this.psdSize)
    const bitmap = await createImageBitmap(canvas)
    // 合成を待つ間に閉じられたら、覚えずに閉じる
    if (this.closed) bitmap.close()
    else this.bitmaps.set(id, bitmap)
  }
}

/** 口の種類ぶん × 開き目を合成済みの FrameStore を作る。フレームごとの再合成を避ける。 */
export async function createFrameStore(
  tree: LayerNode[],
  expression: VisibilityState,
  character: Pick<Character, 'mouthGroupId' | 'mouthMap' | 'eyeGroupId' | 'eyeMap'>,
  psdSize: Size,
): Promise<FrameStore> {
  const store = new FrameStore(tree, expression, character, psdSize)
  try {
    await store.prepare(VOWELS.map((vowel) => ({ vowel, eye: 'open' as const })))
  } catch (e) {
    store.close()
    throw e
  }
  return store
}
