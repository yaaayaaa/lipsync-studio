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
  for (const node of tree) {
    if (node.flip || state[node.id] !== true) continue
    const opacity = node.source.opacity ?? 1
    if (node.isGroup) {
      const children = buildDrawList(node.children, state)
      if (children.length === 0) continue
      ops.push({ kind: 'group', id: node.id, opacity, blend: groupBlend(node.source.blendMode), children })
    } else if (node.source.canvas) {
      ops.push({
        kind: 'layer',
        id: node.id,
        opacity,
        blend: blendModeToComposite(node.source.blendMode) as GlobalCompositeOperation,
        clipping: node.source.clipping === true,
      })
    }
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

export function composeTo(
  ctx: Ctx2D,
  tree: LayerNode[],
  state: VisibilityState,
  psdSize: { width: number; height: number },
): void {
  const nodes = indexNodes(tree)
  const newLayerCanvas = () => {
    const c = new OffscreenCanvas(psdSize.width, psdSize.height)
    return { canvas: c, ctx: c.getContext('2d') as OffscreenCanvasRenderingContext2D }
  }

  const drawLeaf = (target: Ctx2D, op: DrawOp, blend: GlobalCompositeOperation, opacity: number) => {
    const src = nodes.get(op.id)?.source
    if (!src?.canvas) return
    target.globalAlpha = opacity
    target.globalCompositeOperation = blend
    target.drawImage(src.canvas as CanvasImageSource, src.left ?? 0, src.top ?? 0)
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

  const drawOp = (target: Ctx2D, op: Op, blend: GlobalCompositeOperation, opacity: number) => {
    if (op.kind === 'layer') drawLeaf(target, op, blend, opacity)
    else drawGroup(target, op)
  }

  const drawOps = (target: Ctx2D, ops: Op[]) => {
    for (let i = 0; i < ops.length; i++) {
      const base = ops[i]
      // 直後に続く clipping レイヤーを集める（グループ自体の clipping は未対応）
      const clipped: DrawOp[] = []
      while (i + 1 < ops.length) {
        const next = ops[i + 1]
        if (next.kind !== 'layer' || !next.clipping) break
        clipped.push(next)
        i++
      }
      const prevAlpha = target.globalAlpha
      const prevOp = target.globalCompositeOperation
      if (clipped.length === 0 || (base.kind === 'layer' && base.clipping)) {
        // 下地なし（先頭の clipping も含む）または clipping なし: 直接描く
        if (base.kind === 'layer') drawLeaf(target, base, base.blend, base.opacity)
        else drawGroup(target, base)
        for (const c of clipped) drawLeaf(target, c, c.blend, c.opacity)
      } else {
        const tmp = newLayerCanvas()
        drawOp(tmp.ctx, base, 'source-over', 1)
        for (const c of clipped) drawLeaf(tmp.ctx, c, 'source-atop', c.opacity)
        target.globalAlpha = base.opacity
        target.globalCompositeOperation =
          base.blend === 'pass-through' ? 'source-over' : base.blend
        target.drawImage(tmp.canvas, 0, 0)
      }
      target.globalAlpha = prevAlpha
      target.globalCompositeOperation = prevOp
    }
  }

  drawOps(ctx, buildDrawList(tree, state))
}
