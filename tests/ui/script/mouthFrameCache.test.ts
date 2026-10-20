import { describe, expect, it, vi } from 'vitest'
import type { Character, Expression } from '../../../src/core/character/types'
import type { FrameStore } from '../../../src/core/export/frames'
import { MouthFrameCache } from '../../../src/ui/script/mouthFrameCache'
import type { PreparedFrames } from '../../../src/ui/script/mouthFrameCache'

const expression = (id: string, visibility: Record<string, boolean> = {}): Expression => ({ id, name: id, visibility })

const character = (id: string, patch: Partial<Character> = {}): Character => ({
  id,
  name: id,
  psdFileName: `${id}.psd`,
  voice: null,
  mouthGroupId: 'mouth',
  mouthMap: { a: 'm-a' },
  expressions: [expression('e1')],
  ...patch,
})

/** 画像の持ち主は FrameStore なので、閉じられたかだけを見る偽物を返す */
function fakeRender() {
  const stores: { close: ReturnType<typeof vi.fn> }[] = []
  const render = vi.fn(async (): Promise<PreparedFrames> => {
    const store = { close: vi.fn() }
    stores.push(store)
    return { frames: store as unknown as FrameStore, psdSize: { width: 10, height: 20 } }
  })
  return { render, stores }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('MouthFrameCache', () => {
  it('renders once per (character, expression) and reuses it', async () => {
    const { render } = fakeRender()
    const cache = new MouthFrameCache(render)
    const c = character('c1')
    const first = cache.acquire(c, c.expressions[0]!)
    const second = cache.acquire(c, c.expressions[0]!)
    expect(await first.frames).toBe(await second.frames)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('re-renders and closes the old bitmaps when the mouth settings change', async () => {
    const { render, stores } = fakeRender()
    const cache = new MouthFrameCache(render)
    const c = character('c1')
    cache.acquire(c, c.expressions[0]!).release()
    await flush()
    cache.acquire({ ...c, mouthMap: { a: 'm-a2' } }, c.expressions[0]!).release()
    await flush()
    expect(render).toHaveBeenCalledTimes(2)
    expect(stores[0]!.close).toHaveBeenCalledTimes(1)
    expect(stores[1]!.close).not.toHaveBeenCalled()
  })

  it('re-renders when only the eye settings change', async () => {
    const { render, stores } = fakeRender()
    const cache = new MouthFrameCache(render)
    const c = character('c1')
    cache.acquire(c, c.expressions[0]!).release()
    await flush()
    cache.acquire({ ...c, eyeGroupId: 'eyes' }, c.expressions[0]!).release()
    await flush()
    cache.acquire({ ...c, eyeGroupId: 'eyes', eyeMap: { closed: 'e-closed' } }, c.expressions[0]!).release()
    await flush()
    expect(render).toHaveBeenCalledTimes(3)
    expect(stores.slice(0, 2).every((s) => s.close.mock.calls.length === 1)).toBe(true)
    expect(stores[2]!.close).not.toHaveBeenCalled()
  })

  it('re-renders when blinking is switched off, but treats old data as switched on', async () => {
    const { render } = fakeRender()
    const cache = new MouthFrameCache(render)
    const c = { ...character('c1'), eyeGroupId: 'eyes', eyeMap: { closed: 'e-closed' } }
    cache.acquire(c, c.expressions[0]!).release()
    await flush()
    cache.acquire({ ...c, blinkEnabled: true }, c.expressions[0]!).release()
    await flush()
    expect(render).toHaveBeenCalledTimes(1)
    cache.acquire({ ...c, blinkEnabled: false }, c.expressions[0]!).release()
    await flush()
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('does not close bitmaps that are still in use until they are released', async () => {
    const { render, stores } = fakeRender()
    const cache = new MouthFrameCache(render, 1)
    const c1 = character('c1')
    const c2 = character('c2')
    const lease = cache.acquire(c1, c1.expressions[0]!)
    await lease.frames
    cache.acquire(c2, c2.expressions[0]!).release() // c1 を上限で追い出す
    await flush()
    expect(stores[0]!.close).not.toHaveBeenCalled()
    lease.release()
    lease.release() // 2回目は無視される
    await flush()
    expect(stores[0]!.close).toHaveBeenCalledTimes(1)
  })

  it('closes everything on dispose', async () => {
    const { render, stores } = fakeRender()
    const cache = new MouthFrameCache(render)
    const c = character('c1')
    cache.acquire(c, c.expressions[0]!).release()
    cache.dispose()
    await flush()
    expect(stores).toHaveLength(1)
    expect(stores[0]!.close).toHaveBeenCalledTimes(1)
  })

  it('forgets a failed render so the next use retries', async () => {
    const render = vi.fn().mockRejectedValueOnce(new Error('PSD がありません')).mockResolvedValue({
      frames: { close: vi.fn() },
      psdSize: { width: 1, height: 1 },
    })
    const cache = new MouthFrameCache(render)
    const c = character('c1')
    const failed = cache.acquire(c, c.expressions[0]!)
    await expect(failed.frames).rejects.toThrow('PSD がありません')
    failed.release()
    await cache.acquire(c, c.expressions[0]!).frames
    expect(render).toHaveBeenCalledTimes(2)
  })
})
