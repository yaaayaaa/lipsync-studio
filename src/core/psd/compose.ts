import type { LayerId, LayerNode, VisibilityState } from './types'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface DrawOp {
  kind: 'layer'
  id: LayerId
  opacity: number
  blend: GlobalCompositeOperation
  clipping: boolean
}

export interface GroupOp {
  kind: 'group'
  id: LayerId
  opacity: number
  blend: GlobalCompositeOperation | 'pass-through'
  children: (DrawOp | GroupOp)[]
}

export type Op = DrawOp | GroupOp

const BLEND_MODES: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
}

const warnedModes = new Set<string>()

export function blendModeToComposite(mode: string | undefined): GlobalCompositeOperation | 'pass-through' {
  if (mode === undefined) return 'source-over'
  if (mode === 'pass through') return 'pass-through'
  const mapped = BLEND_MODES[mode]
  if (mapped) return mapped
  if (!warnedModes.has(mode)) {
    warnedModes.add(mode)
    console.warn(`Unsupported blend mode "${mode}"; drawing as normal`)
  }
  return 'source-over'
}

/** グループの blendMode が未指定なら PSD の既定どおり pass-through とみなす。 */
function groupBlend(mode: string | undefined): GlobalCompositeOperation | 'pass-through' {
  return mode === undefined ? 'pass-through' : blendModeToComposite(mode)
}

/** 下から上の順。非表示・flip・画像なしの葉・描画物のないグループは含めない。 */
export function buildDrawList(tree: LayerNode[], state: VisibilityState): Op[] {
  const ops: Op[] = []
  // 直近の非 clipping 兄弟（非表示を含む）が描画対象になったか。ならなければ clipping レイヤーも描かない。
  let baseEmitted = false
  for (const node of tree) {
    const isClipping = !node.isGroup && node.source.clipping === true
    if (isClipping && !baseEmitted) continue
    const visible = !node.flip && state[node.id] === true
    const opacity = node.source.opacity ?? 1
    let op: Op | null = null
    if (visible && node.isGroup) {
      const children = buildDrawList(node.children, state)
      if (children.length > 0) {
        op = { kind: 'group', id: node.id, opacity, blend: groupBlend(node.source.blendMode), children }
      }
    } else if (visible && node.source.canvas) {
      op = {
        kind: 'layer',
        id: node.id,
        opacity,
        blend: blendModeToComposite(node.source.blendMode) as GlobalCompositeOperation,
        clipping: isClipping,
      }
    }
    if (op) ops.push(op)
    if (!isClipping) baseEmitted = op !== null
  }
  return ops
}

function indexNodes(tree: LayerNode[], map = new Map<LayerId, LayerNode>()): Map<LayerId, LayerNode> {
  for (const n of tree) {
    map.set(n.id, n)
    indexNodes(n.children, map)
  }
  return map
}

/**
 * PSD のどこをどの倍率で描くか。PSD 座標 (px, py) は出力の ((px - x) * scale, (py - y) * scale) に来る。
 * width/height は出力（と途中の作業用 canvas）の大きさ。縮小画像を小さな作業用 canvas だけで作るために使う。
 */
export interface ComposeView {
  x: number
  y: number
  scale: number
  width: number
  height: number
}

/** view を省くと PSD と同じ大きさ・等倍で描く（書き出しとプレビュー） */
export function composeTo(
  ctx: Ctx2D,
  tree: LayerNode[],
  state: VisibilityState,
  psdSize: { width: number; height: number },
  view?: ComposeView,
): void {
  const nodes = indexNodes(tree)
  const outSize = view ?? psdSize
  const newLayerCanvas = () => {
    const c = new OffscreenCanvas(outSize.width, outSize.height)
    return { canvas: c, ctx: c.getContext('2d') as OffscreenCanvasRenderingContext2D }
  }

  const drawLeaf = (target: Ctx2D, op: DrawOp, blend: GlobalCompositeOperation, opacity: number) => {
    const src = nodes.get(op.id)?.source
    if (!src?.canvas) return
    target.globalAlpha = opacity
    target.globalCompositeOperation = blend
    const image = src.canvas as CanvasImageSource
    const left = src.left ?? 0
    const top = src.top ?? 0
    if (!view) {
      target.drawImage(image, left, top)
      return
    }
    const { x, y, scale } = view
    target.drawImage(image, (left - x) * scale, (top - y) * scale, src.canvas.width * scale, src.canvas.height * scale)
  }

  const drawGroup = (target: Ctx2D, op: GroupOp) => {
    // pass-through は親に直接描く。ただし不透明度が1未満なら個別に束ねないと表現できないので通常として扱う。
    if (op.blend === 'pass-through' && op.opacity >= 1) {
      drawOps(target, op.children)
      return
    }
    const tmp = newLayerCanvas()
    drawOps(tmp.ctx, op.children)
    target.globalAlpha = op.opacity
    target.globalCompositeOperation = op.blend === 'pass-through' ? 'source-over' : op.blend
    target.drawImage(tmp.canvas, 0, 0)
  }

  const drawOp = (target: Ctx2D, op: Op) => {
    if (op.kind === 'layer') drawLeaf(target, op, op.blend, op.opacity)
    else drawGroup(target, op)
  }

  const drawOps = (target: Ctx2D, ops: Op[]) => {
    for (let i = 0; i < ops.length; i++) {
      const base = ops[i]
      // 直後に続く clipping レイヤーを集める（グループ自体の clipping は未対応）。
      // buildDrawList が下地のない clipping を除くので、先頭に clipping が来ることはない。
      const clipped: DrawOp[] = []
      while (i + 1 < ops.length) {
        const next = ops[i + 1]
        if (next.kind !== 'layer' || !next.clipping) break
        clipped.push(next)
        i++
      }
      const prevAlpha = target.globalAlpha
      const prevOp = target.globalCompositeOperation
      if (clipped.length === 0) {
        drawOp(target, base)
      } else {
        const tmp = newLayerCanvas()
        // 下地は不透明度・描画モードを付けずに束ね、結果にだけ付ける（二重適用を避ける）
        if (base.kind === 'layer') drawLeaf(tmp.ctx, base, 'source-over', 1)
        else drawOps(tmp.ctx, base.children)
        for (const c of clipped) drawLeaf(tmp.ctx, c, 'source-atop', c.opacity)
        target.globalAlpha = base.opacity
        target.globalCompositeOperation = base.blend === 'pass-through' ? 'source-over' : base.blend
        target.drawImage(tmp.canvas, 0, 0)
      }
      target.globalAlpha = prevAlpha
      target.globalCompositeOperation = prevOp
    }
  }

  drawOps(ctx, buildDrawList(tree, state))
}
