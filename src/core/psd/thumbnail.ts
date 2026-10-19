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

/**
 * グループの子孫のうち state で描かれるものの範囲と key。グループ自身や祖先の表示状態は見ない
 * （隠れたグループでも中身が分かるように）。何も描かれなければ null。
 */
export function groupThumbPlan(group: LayerNode, state: VisibilityState): GroupThumbPlan | null {
  const nodes = indexChildren(group.children)
  const rects: Rect[] = []
  const walk = (ops: Op[]): string =>
    ops
      .map((op) => {
        if (op.kind === 'group') return `${op.id}(${walk(op.children)})`
        // clipping は下地の範囲からはみ出して描かれないので範囲に入れない
        const src = nodes.get(op.id)?.source
        if (!op.clipping && src?.canvas) {
          rects.push({ x: src.left ?? 0, y: src.top ?? 0, width: src.canvas.width, height: src.canvas.height })
        }
        return op.id
      })
      .join(',')
  const key = walk(buildDrawList(group.children, state))
  const bounds = unionRects(rects)
  return bounds ? { key, bounds } : null
}
