import type { Layer } from 'ag-psd'
import { describe, expect, it } from 'vitest'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import { fitContain, groupThumbPlan, opaqueBounds, unionRects } from '../../../src/core/psd/thumbnail'
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

/** width×height の RGBA。opaque の座標だけ不透明にする */
function rgba(width: number, height: number, opaque: [number, number][], alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [x, y] of opaque) {
    data.set([10, 20, 30, alpha], (y * width + x) * 4)
  }
  return data
}

describe('opaqueBounds', () => {
  it('returns null for a fully transparent image (even if colour channels are set)', () => {
    const data = new Uint8ClampedArray(5 * 4 * 4).fill(200)
    for (let i = 3; i < data.length; i += 4) data[i] = 0
    expect(opaqueBounds(data, 5, 4)).toBeNull()
    expect(opaqueBounds(new Uint8ClampedArray(0), 0, 0)).toBeNull()
  })

  it('finds a single pixel', () => {
    expect(opaqueBounds(rgba(7, 5, [[3, 2]]), 7, 5)).toEqual({ x: 3, y: 2, width: 1, height: 1 })
  })

  it('counts any non-zero alpha as opaque', () => {
    expect(opaqueBounds(rgba(4, 4, [[1, 1]], 1), 4, 4)).toEqual({ x: 1, y: 1, width: 1, height: 1 })
  })

  it('handles pixels on every edge', () => {
    expect(opaqueBounds(rgba(6, 4, [[0, 2], [5, 1], [2, 0], [3, 3]]), 6, 4)).toEqual({ x: 0, y: 0, width: 6, height: 4 })
    expect(opaqueBounds(rgba(6, 4, [[5, 3]]), 6, 4)).toEqual({ x: 5, y: 3, width: 1, height: 1 })
    expect(opaqueBounds(rgba(6, 4, [[0, 0]]), 6, 4)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('bounds a typical blob in the middle of a large transparent canvas', () => {
    const pts: [number, number][] = []
    // 中心 (70, 90)・半径 20×10 の楕円（x 50〜90, y 80〜100）。行ごとに左右の端が違う
    for (let y = 0; y <= 40; y++) {
      for (let x = 0; x <= 40; x++) {
        if (((x - 20) / 20) ** 2 + ((y - 20) / 10) ** 2 <= 1) pts.push([x + 50, y + 70])
      }
    }
    // 楕円の上端の行より左に離れた1点で、左端だけが広がる
    pts.push([45, 80])
    expect(opaqueBounds(rgba(200, 150, pts), 200, 150)).toEqual({ x: 45, y: 80, width: 46, height: 21 })
  })
})

describe('groupThumbPlan with opaque leaf bounds', () => {
  it('unions the leaves\' opaque boxes offset by their left/top', () => {
    const tree = buildLayerTree([
      layer('g', { children: [placed('a', 0, 0, 400, 800), placed('b', 10, 20, 100, 100)] }),
    ])
    const boxes: Record<string, { x: number; y: number; width: number; height: number } | null> = {
      '0/0': { x: 180, y: 258, width: 40, height: 6 },
      '0/1': { x: 5, y: 5, width: 10, height: 10 },
    }
    const plan = groupThumbPlan(tree[0], initialVisibility(tree), (n) => boxes[n.id])
    expect(plan?.bounds).toEqual({ x: 15, y: 25, width: 205, height: 239 })
  })

  it('skips fully transparent leaves and returns null when all drawn leaves are transparent', () => {
    const tree = buildLayerTree([layer('g', { children: [placed('a', 0, 0, 10, 10), placed('b', 0, 0, 10, 10)] })])
    const state = initialVisibility(tree)
    expect(groupThumbPlan(tree[0], state, (n) => (n.id === '0/0' ? null : { x: 1, y: 2, width: 3, height: 4 }))?.bounds).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    })
    expect(groupThumbPlan(tree[0], state, () => null)).toBeNull()
  })
})
