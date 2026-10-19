import { describe, expect, it, vi } from 'vitest'
import type { Character, Expression } from '../../../src/core/character/types'
import { VOWELS } from '../../../src/core/character/types'
import type { MouthFrames } from '../../../src/core/export/frames'
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

function fakeRender() {
  const bitmaps: { close: ReturnType<typeof vi.fn> }[] = []
  const render = vi.fn(async (): Promise<PreparedFrames> => {
    const frames = new Map() as MouthFrames
    for (const v of VOWELS) {
      const bitmap = { close: vi.fn() }
      bitmaps.push(bitmap)
      frames.set(v, bitmap as unknown as ImageBitmap)
    }
    return { frames, psdSize: { width: 10, height: 20 } }
  })
  return { render, bitmaps }
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
    const { render, bitmaps } = fakeRender()
    const cache = new MouthFrameCache(render)
    const c = character('c1')
    cache.acquire(c, c.expressions[0]!).release()
    await flush()
    cache.acquire({ ...c, mouthMap: { a: 'm-a2' } }, c.expressions[0]!).release()
    await flush()
    expect(render).toHaveBeenCalledTimes(2)
    expect(bitmaps.slice(0, VOWELS.length).every((b) => b.close.mock.calls.length === 1)).toBe(true)
    expect(bitmaps.slice(VOWELS.length).every((b) => b.close.mock.calls.length === 0)).toBe(true)
  })

  it('does not close bitmaps that are still in use until they are released', async () => {
    const { render, bitmaps } = fakeRender()
    const cache = new MouthFrameCache(render, 1)
    const c1 = character('c1')
    const c2 = character('c2')
    const lease = cache.acquire(c1, c1.expressions[0]!)
    await lease.frames
    cache.acquire(c2, c2.expressions[0]!).release() // c1 を上限で追い出す
    await flush()
    expect(bitmaps[0]!.close).not.toHaveBeenCalled()
    lease.release()
    lease.release() // 2回目は無視される
    await flush()
    expect(bitmaps.slice(0, VOWELS.length).every((b) => b.close.mock.calls.length === 1)).toBe(true)
  })

  it('closes everything on dispose', async () => {
    const { render, bitmaps } = fakeRender()
    const cache = new MouthFrameCache(render)
    const c = character('c1')
    cache.acquire(c, c.expressions[0]!).release()
    cache.dispose()
    await flush()
    expect(bitmaps).toHaveLength(VOWELS.length)
    expect(bitmaps.every((b) => b.close.mock.calls.length === 1)).toBe(true)
  })

  it('forgets a failed render so the next use retries', async () => {
    const render = vi.fn().mockRejectedValueOnce(new Error('PSD がありません')).mockResolvedValue({
      frames: new Map(),
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
