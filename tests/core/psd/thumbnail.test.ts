import type { Layer } from 'ag-psd'
import { describe, expect, it } from 'vitest'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import { fitContain, groupThumbPlan, unionRects } from '../../../src/core/psd/thumbnail'
import { initialVisibility, setVisible } from '../../../src/core/psd/visibility'
import { layer } from '../../fixtures/makePsd'

/** left/top に置いた width×height の画像を持つリーフ */
function placed(name: string, left: number, top: number, width: number, height: number, extra: Partial<Layer> = {}): Layer {
  return {
    name,
    left,
    top,
    canvas: { width, height } as unknown as NonNullable<Layer['canvas']>,
    ...extra,
  }
}

describe('fitContain', () => {
  it('scales a wide source down to the box width and centers it vertically', () => {
    expect(fitContain({ width: 200, height: 100 }, { width: 40, height: 40 })).toEqual({
      x: 0,
      y: 10,
      width: 40,
      height: 20,
    })
  })

  it('scales a tall source to the box height and centers it horizontally', () => {
    expect(fitContain({ width: 50, height: 100 }, { width: 40, height: 40 })).toEqual({
      x: 10,
      y: 0,
      width: 20,
      height: 40,
    })
  })

  it('scales a small source up so that small parts appear large', () => {
    expect(fitContain({ width: 10, height: 5 }, { width: 40, height: 40 })).toEqual({
      x: 0,
      y: 10,
      width: 40,
      height: 20,
    })
  })

  it('returns null for an empty source or box', () => {
    expect(fitContain({ width: 0, height: 10 }, { width: 40, height: 40 })).toBeNull()
    expect(fitContain({ width: 10, height: 10 }, { width: 0, height: 40 })).toBeNull()
  })
})

describe('unionRects', () => {
  it('returns the smallest rect containing all rects', () => {
    expect(
      unionRects([
        { x: 10, y: 20, width: 5, height: 5 },
        { x: 0, y: 30, width: 2, height: 10 },
      ]),
    ).toEqual({ x: 0, y: 20, width: 15, height: 20 })
  })

  it('ignores zero-area rects and returns null when nothing remains', () => {
    expect(unionRects([{ x: 0, y: 0, width: 0, height: 10 }])).toBeNull()
    expect(unionRects([])).toBeNull()
    expect(
      unionRects([
        { x: 100, y: 100, width: 0, height: 0 },
        { x: 1, y: 2, width: 3, height: 4 },
      ]),
    ).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})

describe('groupThumbPlan', () => {
  it('bounds the drawn leaves of the group in PSD coordinates', () => {
    const tree = buildLayerTree([
      layer('g', { children: [placed('a', 10, 20, 30, 10), placed('b', 50, 5, 10, 10)] }),
    ])
    const plan = groupThumbPlan(tree[0], initialVisibility(tree))
    expect(plan?.bounds).toEqual({ x: 10, y: 5, width: 50, height: 25 })
  })

  it('only counts descendants visible in the given state, including nested groups', () => {
    const tree = buildLayerTree([
      layer('g', {
        children: [
          placed('*mouth-a', 0, 0, 10, 10),
          placed('*mouth-b', 100, 100, 20, 20),
          layer('inner', { children: [placed('c', 40, 40, 5, 5)] }),
        ],
      }),
    ])
    // radio の初期値は一番上（mouth-b）だが、明示的に mouth-a を選ぶ
    const state = setVisible(tree, initialVisibility(tree), '0/0', true)
    expect(groupThumbPlan(tree[0], state)?.bounds).toEqual({ x: 0, y: 0, width: 45, height: 45 })
    const innerHidden = setVisible(tree, state, '0/2', false)
    expect(groupThumbPlan(tree[0], innerHidden)?.bounds).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('still shows the contents of a group that is itself hidden', () => {
    const tree = buildLayerTree([layer('g', { hidden: true, children: [placed('a', 1, 2, 3, 4)] })])
    expect(groupThumbPlan(tree[0], initialVisibility(tree))?.bounds).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })

  it('ignores clipping layers for the bounds because they cannot extend past their base', () => {
    const tree = buildLayerTree([
      layer('g', { children: [placed('base', 10, 10, 10, 10), placed('clip', 0, 0, 100, 100, { clipping: true })] }),
    ])
    expect(groupThumbPlan(tree[0], initialVisibility(tree))?.bounds).toEqual({ x: 10, y: 10, width: 10, height: 10 })
  })

  it('returns null when nothing in the group is drawn', () => {
    const tree = buildLayerTree([
      layer('g', { children: [layer('noimg'), placed('off', 0, 0, 5, 5, { hidden: true })] }),
      layer('empty', { children: [] }),
    ])
    const state = initialVisibility(tree)
    expect(groupThumbPlan(tree[0], state)).toBeNull()
    expect(groupThumbPlan(tree[1], state)).toBeNull()
  })

  it('changes its key exactly when what would be drawn changes', () => {
    const tree = buildLayerTree([
      layer('g', { children: [placed('*a', 0, 0, 5, 5), placed('*b', 0, 0, 5, 5), layer('noimg')] }),
    ])
    const s0 = initialVisibility(tree)
    const key0 = groupThumbPlan(tree[0], s0)?.key
    // 画像のないレイヤーを切り替えても描くものは変わらない
    expect(groupThumbPlan(tree[0], setVisible(tree, s0, '0/2', false))?.key).toBe(key0)
    // radio を切り替えると変わる
    const s1 = setVisible(tree, s0, '0/0', true)
    expect(groupThumbPlan(tree[0], s1)?.key).not.toBe(key0)
    // 戻せば同じ key に戻る
    expect(groupThumbPlan(tree[0], setVisible(tree, s1, '0/1', true))?.key).toBe(key0)
  })

  it('distinguishes nesting in the key', () => {
    const tree = buildLayerTree([
      layer('g', {
        children: [layer('inner', { children: [placed('a', 0, 0, 1, 1)] }), placed('b', 0, 0, 1, 1)],
      }),
    ])
    const s0 = initialVisibility(tree)
    const keys = new Set([
      groupThumbPlan(tree[0], s0)?.key,
      groupThumbPlan(tree[0], setVisible(tree, s0, '0/0', false))?.key,
      groupThumbPlan(tree[0], setVisible(tree, s0, '0/1', false))?.key,
    ])
    expect(keys.size).toBe(3)
  })
})
