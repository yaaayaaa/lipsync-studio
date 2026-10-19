import type { Layer } from 'ag-psd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import { initialVisibility } from '../../../src/core/psd/visibility'
import { planThumb, requestThumb } from '../../../src/ui/character/layerThumbs'

// Node には OffscreenCanvas がないので、走査と描画はここで必ず失敗する（失敗時の振る舞いを確かめる）
function placed(name: string, left: number, top: number, width: number, height: number): Layer {
  return { name, left, top, canvas: { width, height } as unknown as NonNullable<Layer['canvas']> }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('requestThumb when scanning fails', () => {
  it('stops retrying: a group whose leaf scans throw is attempted once, and the queue drains', () => {
    const tree = buildLayerTree([{ name: 'g', children: [placed('a', 0, 0, 10, 10), placed('b', 5, 5, 10, 10)] }])
    const group = tree[0]
    const plan = planThumb(group, initialVisibility(tree))
    expect(plan).not.toBeNull()
    const onReady = vi.fn()
    requestThumb(group, plan!, { width: 100, height: 100 }, onReady)
    // 走査が失敗し続けると仕事が自分を積み直して終わらず、ここで打ち切りの例外になる
    expect(() => vi.runAllTimers()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('logs scan failures only once', () => {
    const tree = buildLayerTree([{ name: 'g', children: [placed('a', 0, 0, 10, 10), placed('b', 5, 5, 10, 10)] }])
    const plan = planThumb(tree[0], initialVisibility(tree))
    requestThumb(tree[0], plan!, { width: 100, height: 100 }, () => {})
    vi.runAllTimers()
    const scanErrors = vi.mocked(console.error).mock.calls.filter((c) => String(c[0]).includes('scan'))
    expect(scanErrors.length).toBeLessThanOrEqual(1)
  })
})
