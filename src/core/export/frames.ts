import { applyMouth, resolveMouthLayer } from '../character/mouth'
import { VOWELS } from '../character/types'
import type { Character, ExportSettings, Vowel } from '../character/types'
import { mouthAt } from '../lipsync/timeline'
import type { MouthTimeline } from '../lipsync/timeline'
import { composeTo } from '../psd/compose'
import type { LayerNode, VisibilityState } from '../psd/types'

export const FPS = 30

type Size = { width: number; height: number }

/** 各フレームの口。フレーム数は ceil(duration * fps)、i 番目は区間の中央 (i+0.5)/fps の口。 */
export function frameSchedule(timeline: MouthTimeline, fps: number = FPS): Vowel[] {
  // 浮動小数の誤差（例: 1.0000000000000002 * 30）で1フレーム増えないよう微小量を引く
  const count = Math.ceil(timeline.duration * fps - 1e-9)
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

export type MouthFrames = Map<Vowel, ImageBitmap>

/** 6種の口それぞれの立ち絵（PSD サイズ）を先に合成しておく。フレームごとの再合成を避ける。 */
export async function prerenderMouthFrames(
  tree: LayerNode[],
  expression: VisibilityState,
  character: Pick<Character, 'mouthGroupId' | 'mouthMap'>,
  psdSize: Size,
): Promise<MouthFrames> {
  const frames: MouthFrames = new Map()
  try {
    for (const vowel of VOWELS) {
      const canvas = new OffscreenCanvas(psdSize.width, psdSize.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2D canvas context を作れませんでした')
      const state = applyMouth(tree, expression, character.mouthGroupId, resolveMouthLayer(character.mouthMap, vowel))
      composeTo(ctx, tree, state, psdSize)
      frames.set(vowel, await createImageBitmap(canvas))
    }
  } catch (e) {
    for (const bitmap of frames.values()) bitmap.close()
    throw e
  }
  return frames
}
