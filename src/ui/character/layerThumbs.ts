import { composeTo } from '../../core/psd/compose'
import { fitContain, groupThumbPlan, intersectRects, mapScanBounds, opaqueBounds } from '../../core/psd/thumbnail'
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
   透明な余白を除いてから収めないと口や目が点になる。リーフごとに1回、縮小した写しを走査して求める ---- */

/** 走査用の写しの長辺。1回の読み出しを小さく保つ */
const SCAN_PX = 128
/** 絞り込みの回数の上限。小さな部品は2回目で等倍になり、大きな部品も3回で誤差が長辺の1%未満になる */
const MAX_SCAN_PASSES = 4

const opaqueCache = new WeakMap<LayerNode, Rect | null>()
let scanCtx: OffscreenCanvasRenderingContext2D | null = null

/** src の region を長辺 SCAN_PX 以下に縮小して走査し、中身のある範囲を元の座標で返す */
function scanRegion(src: CanvasImageSource, region: Rect): Rect | null {
  if (!scanCtx) {
    // 何度も読み出すので、読み出し向けの canvas にする（GPU からの読み戻しを避ける）
    scanCtx = new OffscreenCanvas(SCAN_PX, SCAN_PX).getContext('2d', {
      willReadFrequently: true,
    }) as OffscreenCanvasRenderingContext2D
    // 縮小で細い線が消えないよう、画素を平均する高品質の縮小を使う（残りは mapScanBounds の余白で補う）
    scanCtx.imageSmoothingEnabled = true
    scanCtx.imageSmoothingQuality = 'high'
  }
  const s = Math.min(1, SCAN_PX / Math.max(region.width, region.height))
  const size = { width: Math.max(1, Math.round(region.width * s)), height: Math.max(1, Math.round(region.height * s)) }
  scanCtx.clearRect(0, 0, SCAN_PX, SCAN_PX)
  scanCtx.drawImage(src, region.x, region.y, region.width, region.height, 0, 0, size.width, size.height)
  const found = opaqueBounds(scanCtx.getImageData(0, 0, size.width, size.height).data, size.width, size.height)
  return found && mapScanBounds(found, size, region)
}

/**
 * リーフの canvas 内で中身のある範囲（PSD のキャンバス内に限る）を求めて覚える。全部透明なら null。
 * 全体を粗く走査し、見つかった範囲だけをもう一度細かく走査することを等倍になるまで繰り返す。
 */
function scanLeaf(leaf: LayerNode, psdSize: PsdSize): void {
  if (opaqueCache.has(leaf)) return
  const src = leaf.source.canvas
  let bounds: Rect | null = null
  if (src && src.width > 0 && src.height > 0) {
    let region: Rect | null = { x: 0, y: 0, width: src.width, height: src.height }
    for (let pass = 0; pass < MAX_SCAN_PASSES && region; pass++) {
      const next = scanRegion(src as CanvasImageSource, region)
      // 2回目以降に見つからないのは縮小のぼけで拾った画素なので、広い方の範囲のままにする（欠けない側に倒す）
      if (!next) {
        if (pass === 0) region = null
        break
      }
      const exact = Math.max(region.width, region.height) <= SCAN_PX
      const same = next.x === region.x && next.y === region.y && next.width === region.width && next.height === region.height
      region = next
      if (exact || same) break
    }
    // PSD のキャンバスの外にはみ出た部分は描かれないので除く（canvas の座標に直して重ねる）
    const { left = 0, top = 0 } = leaf.source
    bounds = region && intersectRects(region, { x: -left, y: -top, width: psdSize.width, height: psdSize.height })
  }
  opaqueCache.set(leaf, bounds)
}

/** plan を描くのに必要で、まだ走査していないリーフ */
function unscannedLeaves(node: LayerNode, plan: ThumbPlan): LayerNode[] {
  if (plan.kind === 'leaf') return opaqueCache.has(node) ? [] : [node]
  const missing: LayerNode[] = []
  groupThumbPlan(node, plan.state, {
    leafBounds: (leaf) => {
      if (!opaqueCache.has(leaf)) missing.push(leaf)
      return null
    },
  })
  return missing
}

interface Entry {
  key: string
  /** null は描くものがない（全部透明） */
  image: ImageBitmap | null
}

// レイヤーの節点はキャラごとの PSD 解析キャッシュ（usePsd）が持つので、節点をキーにすると
// 解析結果が捨てられたときにサムネイルも一緒に捨てられる。グループは最新の key の1枚だけ持つ。
const cache = new WeakMap<LayerNode, Entry>()

/** 必要なリーフはすべて走査済みであること */
function render(node: LayerNode, plan: ThumbPlan, psdSize: PsdSize): ImageBitmap | null {
  const box = { width: THUMB_PX, height: THUMB_PX }
  // 中身のある範囲（リーフは canvas の座標、グループは PSD の座標）
  const bounds =
    plan.kind === 'leaf'
      ? (opaqueCache.get(node) ?? null)
      : groupThumbPlan(node, plan.state, {
          leafBounds: (leaf) => opaqueCache.get(leaf) ?? null,
          clipTo: { x: 0, y: 0, width: psdSize.width, height: psdSize.height },
        })?.bounds
  const r = bounds ? fitContain(bounds, box) : null
  if (!bounds || !r) return null
  const canvas = new OffscreenCanvas(THUMB_PX, THUMB_PX)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (plan.kind === 'leaf') {
    const src = node.source.canvas as CanvasImageSource
    ctx.drawImage(src, bounds.x, bounds.y, bounds.width, bounds.height, r.x, r.y, r.width, r.height)
  } else {
    // 合成の規則は本体と同じものを使う。縮小した座標で直接描くので、作業用の canvas もサムネイルの大きさで済む
    const scale = r.width / bounds.width
    const view = { x: bounds.x - r.x / scale, y: bounds.y - r.y / scale, scale, width: THUMB_PX, height: THUMB_PX }
    composeTo(ctx, node.children, plan.state, psdSize, view)
  }
  return canvas.transferToImageBitmap()
}

/* ---- 後回しの実行：空き時間に少しずつ作り、ツリーを開いた瞬間に固まらないようにする。
   リーフの走査は1枚ずつ別の仕事にし、グループはその後に回すので、1つの仕事が長くならない ---- */

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
  const job = () => {
    if (cancelled) return
    // 同じ節点を別の場所（ツリーと口の選択）が先に作っていれば使い回す
    const cur = cache.get(node)
    if (cur && cur.key === plan.key) {
      onReady(cur.image)
      return
    }
    const missing = unscannedLeaves(node, plan)
    if (missing.length > 0) {
      // 走査を先頭に1枚ずつ積み、その直後にこの仕事をやり直す
      queue.unshift(...missing.map((leaf) => () => scanLeaf(leaf, psdSize)), job)
      return
    }
    const image = render(node, plan, psdSize)
    // 古い版は描き写し済みなので、GPU のメモリを早めに返す
    cur?.image?.close()
    cache.set(node, { key: plan.key, image })
    onReady(image)
  }
  queue.push(job)
  scheduleRun()
  return () => {
    cancelled = true
  }
}
