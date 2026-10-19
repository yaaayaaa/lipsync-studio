import { buildDrawList } from './compose'
import type { Op } from './compose'
import type { LayerId, LayerNode, VisibilityState } from './types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Size {
  width: number
  height: number
}

/** src を縦横比を保ったまま box に収め、中央に置いた位置。小さい src は拡大する。 */
export function fitContain(src: Size, box: Size): Rect | null {
  if (src.width <= 0 || src.height <= 0 || box.width <= 0 || box.height <= 0) return null
  const scale = Math.min(box.width / src.width, box.height / src.height)
  const width = src.width * scale
  const height = src.height * scale
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height }
}

/** 面積のある矩形をすべて含む最小の矩形。面積のある矩形がなければ null。 */
export function unionRects(rects: Rect[]): Rect | null {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue
    left = Math.min(left, r.x)
    top = Math.min(top, r.y)
    right = Math.max(right, r.x + r.width)
    bottom = Math.max(bottom, r.y + r.height)
  }
  if (left === Infinity) return null
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** 不透明（alpha > 0）な画素の外接矩形。すべて透明なら null。上下は行単位で早く打ち切り、左右は未確定の範囲だけ見る。 */
export function opaqueBounds(data: Uint8ClampedArray, width: number, height: number): Rect | null {
  const opaque = (x: number, y: number) => data[(y * width + x) * 4 + 3] > 0
  const rowHasOpaque = (y: number, from: number, to: number) => {
    for (let x = from; x <= to; x++) if (opaque(x, y)) return true
    return false
  }
  let top = 0
  while (top < height && !rowHasOpaque(top, 0, width - 1)) top++
  if (top === height) return null
  let bottom = height - 1
  while (!rowHasOpaque(bottom, 0, width - 1)) bottom--
  // 左右は、まだ見つかっていない外側の列だけを各行で調べる
  let left = width
  let right = -1
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < left; x++) {
      if (opaque(x, y)) {
        left = x
        break
      }
    }
    for (let x = width - 1; x > right; x--) {
      if (opaque(x, y)) {
        right = x
        break
      }
    }
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

export interface GroupThumbPlan {
  /** 描かれる内容が同じなら同じ値。サムネイルを作り直すかの判定に使う */
  key: string
  /** 描かれるリーフを囲む矩形（PSD 座標） */
  bounds: Rect
}

function indexChildren(nodes: LayerNode[], map = new Map<LayerId, LayerNode>()): Map<LayerId, LayerNode> {
  for (const n of nodes) {
    map.set(n.id, n)
    indexChildren(n.children, map)
  }
  return map
}

/** リーフの canvas 内で中身のある範囲（canvas の座標）。null なら全部透明 */
export type LeafBounds = (leaf: LayerNode) => Rect | null

const wholeCanvas: LeafBounds = (leaf) => {
  const c = leaf.source.canvas
  return c ? { x: 0, y: 0, width: c.width, height: c.height } : null
}

/**
 * グループの子孫のうち state で描かれるものの範囲と key。グループ自身や祖先の表示状態は見ない
 * （隠れたグループでも中身が分かるように）。何も描かれなければ null。
 * leafBounds を渡すと各リーフをその範囲（透明な余白を除いた範囲など）に絞る。既定は canvas 全体。
 */
export function groupThumbPlan(
  group: LayerNode,
  state: VisibilityState,
  leafBounds: LeafBounds = wholeCanvas,
): GroupThumbPlan | null {
  const nodes = indexChildren(group.children)
  const rects: Rect[] = []
  const walk = (ops: Op[]): string =>
    ops
      .map((op) => {
        if (op.kind === 'group') return `${op.id}(${walk(op.children)})`
        // clipping は下地の範囲からはみ出して描かれないので範囲に入れない
        const node = nodes.get(op.id)
        const local = !op.clipping && node ? leafBounds(node) : null
        if (node && local) {
          const { left = 0, top = 0 } = node.source
          rects.push({ x: left + local.x, y: top + local.y, width: local.width, height: local.height })
        }
        return op.id
      })
      .join(',')
  const key = walk(buildDrawList(group.children, state))
  const bounds = unionRects(rects)
  return bounds ? { key, bounds } : null
}
