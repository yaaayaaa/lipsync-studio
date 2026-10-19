import { composeTo } from '../../core/psd/compose'
import { fitContain, groupThumbPlan, opaqueBounds } from '../../core/psd/thumbnail'
import type { Rect } from '../../core/psd/thumbnail'
import type { LayerNode, VisibilityState } from '../../core/psd/types'
import type { PsdSize } from '../usePsd'

/** サムネイルの実ピクセル数（正方形）。表示は 40〜48px なので高密度画面でも粗く見えない大きさにする */
export const THUMB_PX = 96

/**
 * 何を描くか。null なら空の枠を出す。描画前に同期で決めるので、画素は読まない（安い判定だけ）。
 * 全部透明かどうかは画素を読むまで分からないので、requestThumb の結果（null）で知らせる。
 */
export type ThumbPlan = { kind: 'leaf'; key: string } | { kind: 'group'; key: string; state: VisibilityState }

export function planThumb(node: LayerNode, state: VisibilityState): ThumbPlan | null {
  if (!node.isGroup) {
    const c = node.source.canvas
    return c && c.width > 0 && c.height > 0 ? { kind: 'leaf', key: 'leaf' } : null
  }
  const plan = groupThumbPlan(node, state)
  return plan && { kind: 'group', key: plan.key, state }
}

/* ---- リーフの中身のある範囲：PSD によってはレイヤーがキャンバス全体の大きさで保存されているので、
   透明な余白を除いてから収めないと口や目が点になる。画素の走査はリーフごとに1回だけ ---- */

const opaqueCache = new WeakMap<LayerNode, Rect | null>()

function leafOpaqueBounds(leaf: LayerNode): Rect | null {
  if (opaqueCache.has(leaf)) return opaqueCache.get(leaf) ?? null
  const src = leaf.source.canvas
  let bounds: Rect | null = null
  if (src && src.width > 0 && src.height > 0) {
    const ctx = src.getContext('2d') as CanvasRenderingContext2D | null
    // 読めない canvas は余白を除かずに全体を使う
    bounds = ctx
      ? opaqueBounds(ctx.getImageData(0, 0, src.width, src.height).data, src.width, src.height)
      : { x: 0, y: 0, width: src.width, height: src.height }
  }
  opaqueCache.set(leaf, bounds)
  return bounds
}

interface Entry {
  key: string
  /** null は描くものがない（全部透明） */
  image: ImageBitmap | null
}

// レイヤーの節点はキャラごとの PSD 解析キャッシュ（usePsd）が持つので、節点をキーにすると
// 解析結果が捨てられたときにサムネイルも一緒に捨てられる。グループは最新の key の1枚だけ持つ。
const cache = new WeakMap<LayerNode, Entry>()

function render(node: LayerNode, plan: ThumbPlan, psdSize: PsdSize): ImageBitmap | null {
  const box = { width: THUMB_PX, height: THUMB_PX }
  // 中身のある範囲（リーフは canvas の座標、グループは PSD の座標）
  const bounds = plan.kind === 'leaf' ? leafOpaqueBounds(node) : groupThumbPlan(node, plan.state, leafOpaqueBounds)?.bounds
  const r = bounds ? fitContain(bounds, box) : null
  if (!bounds || !r) return null
  const canvas = new OffscreenCanvas(THUMB_PX, THUMB_PX)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (plan.kind === 'leaf') {
    const src = node.source.canvas as HTMLCanvasElement
    ctx.drawImage(src, bounds.x, bounds.y, bounds.width, bounds.height, r.x, r.y, r.width, r.height)
  } else {
    // 合成の規則は本体と同じものを使い、変換行列で範囲の切り出しと縮小を同時に行う
    const scale = r.width / bounds.width
    ctx.setTransform(scale, 0, 0, scale, r.x - bounds.x * scale, r.y - bounds.y * scale)
    composeTo(ctx, node.children, plan.state, psdSize)
  }
  return canvas.transferToImageBitmap()
}

/* ---- 後回しの実行：空き時間に少しずつ作り、ツリーを開いた瞬間に固まらないようにする ---- */

const FRAME_BUDGET_MS = 8
const queue: (() => void)[] = []
let scheduled = false

function scheduleRun(): void {
  if (scheduled) return
  scheduled = true
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 100 })
  else setTimeout(run, 0)
}

function run(): void {
  const start = performance.now()
  while (queue.length > 0 && performance.now() - start < FRAME_BUDGET_MS) {
    const job = queue.shift() as () => void
    try {
      job()
    } catch (e) {
      // 1枚の失敗で他のサムネイルを止めない。空のまま残る
      console.error('Failed to render a layer thumbnail', e)
    }
  }
  scheduled = false
  if (queue.length > 0) scheduleRun()
}

/**
 * サムネイルを用意して onReady に渡す。キャッシュにあればその場で、なければ空き時間に作る。
 * 戻り値で取り消すと、まだ作っていなければ作らない（表示状態を素早く変えたときの無駄を省く）。
 */
export function requestThumb(
  node: LayerNode,
  plan: ThumbPlan,
  psdSize: PsdSize,
  /** null は全部透明で描くものがない */
  onReady: (image: ImageBitmap | null) => void,
): () => void {
  const hit = cache.get(node)
  if (hit && hit.key === plan.key) {
    onReady(hit.image)
    return () => {}
  }
  let cancelled = false
  queue.push(() => {
    if (cancelled) return
    // 同じ節点を別の場所（ツリーと口の選択）が先に作っていれば使い回す
    const cur = cache.get(node)
    if (cur && cur.key === plan.key) {
      onReady(cur.image)
      return
    }
    const image = render(node, plan, psdSize)
    // 古い版は描き写し済みなので、GPU のメモリを早めに返す
    cur?.image?.close()
    cache.set(node, { key: plan.key, image })
    onReady(image)
  })
  scheduleRun()
  return () => {
    cancelled = true
  }
}
