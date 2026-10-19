import type { Layer } from 'ag-psd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeTo } from '../../../src/core/psd/compose'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import { initialVisibility } from '../../../src/core/psd/visibility'

/** drawImage の呼び出しを記録するだけの 2D コンテキスト */
class RecordingCtx {
  globalAlpha = 1
  globalCompositeOperation: GlobalCompositeOperation = 'source-over'
  readonly name: string
  readonly calls: { target: string; args: unknown[] }[]
  constructor(name: string, calls: { target: string; args: unknown[] }[]) {
    this.name = name
    this.calls = calls
  }
  drawImage(...args: unknown[]) {
    this.calls.push({ target: this.name, args: args.map((a) => (a && typeof a === 'object' && 'label' in a ? (a as { label: string }).label : a)) })
  }
}

let calls: { target: string; args: unknown[] }[] = []
let created: { label: string; width: number; height: number }[] = []

function stubOffscreen() {
  calls = []
  created = []
  class FakeOffscreen {
    readonly label: string
    readonly width: number
    readonly height: number
    constructor(width: number, height: number) {
      this.width = width
      this.height = height
      this.label = `tmp${created.length}`
      created.push({ label: this.label, width, height })
    }
    getContext() {
      return new RecordingCtx(this.label, calls)
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreen)
}

afterEach(() => vi.unstubAllGlobals())

function img(label: string, left: number, top: number, width: number, height: number, extra: Partial<Layer> = {}): Layer {
  return { name: label, left, top, canvas: { label, width, height } as unknown as NonNullable<Layer['canvas']>, ...extra }
}

const psdSize = { width: 400, height: 800 }

describe('composeTo view', () => {
  it('without a view draws leaves at their PSD position and uses PSD-sized temp canvases (unchanged default)', () => {
    stubOffscreen()
    const tree = buildLayerTree([
      { name: 'g', blendMode: 'multiply', children: [img('a', 10, 20, 30, 40)] },
      img('base', 5, 6, 7, 8),
      img('clip', 0, 0, 400, 800, { clipping: true }),
    ])
    const target = new RecordingCtx('target', calls)
    composeTo(target as unknown as CanvasRenderingContext2D, tree, initialVisibility(tree), psdSize)
    expect(created.map((c) => [c.width, c.height])).toEqual([
      [400, 800],
      [400, 800],
    ])
    expect(calls).toEqual([
      { target: 'tmp0', args: ['a', 10, 20] },
      { target: 'target', args: ['tmp0', 0, 0] },
      { target: 'tmp1', args: ['base', 5, 6] },
      { target: 'tmp1', args: ['clip', 0, 0] },
      { target: 'target', args: ['tmp1', 0, 0] },
    ])
  })

  it('with a view draws scaled and offset into view-sized temp canvases', () => {
    stubOffscreen()
    const tree = buildLayerTree([
      { name: 'g', blendMode: 'multiply', children: [img('a', 10, 20, 30, 40)] },
      img('base', 5, 6, 7, 8),
      img('clip', 0, 0, 400, 800, { clipping: true }),
    ])
    const target = new RecordingCtx('target', calls)
    const view = { x: 4, y: 2, scale: 0.5, width: 96, height: 96 }
    composeTo(target as unknown as CanvasRenderingContext2D, tree, initialVisibility(tree), psdSize, view)
    expect(created.map((c) => [c.width, c.height])).toEqual([
      [96, 96],
      [96, 96],
    ])
    expect(calls).toEqual([
      { target: 'tmp0', args: ['a', 3, 9, 15, 20] },
      { target: 'target', args: ['tmp0', 0, 0] },
      { target: 'tmp1', args: ['base', 0.5, 2, 3.5, 4] },
      { target: 'tmp1', args: ['clip', -2, -1, 200, 400] },
      { target: 'target', args: ['tmp1', 0, 0] },
    ])
  })
})
