import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Character } from '../../../src/core/character/types'
import { VOWELS } from '../../../src/core/character/types'
import { FrameStore, createFrameStore } from '../../../src/core/export/frames'
import { composeTo } from '../../../src/core/psd/compose'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import type { VisibilityState } from '../../../src/core/psd/types'
import { initialVisibility } from '../../../src/core/psd/visibility'
import { layer } from '../../fixtures/makePsd'

// 実際の描画は compose のテストで見ている。ここでは「何を何回合成したか」だけを数える
vi.mock('../../../src/core/psd/compose', () => ({ composeTo: vi.fn() }))

interface FakeBitmap {
  close: ReturnType<typeof vi.fn>
}

/** 0 本体、1 口（closed・a）、2 目（閉じ・半目・開き） */
const tree = buildLayerTree([
  layer('body'),
  layer('mouth', { children: [layer('*closed', { hidden: true }), layer('*a')] }),
  layer('eyes', { children: [layer('*closed', { hidden: true }), layer('*half', { hidden: true }), layer('*open')] }),
])
const expression: VisibilityState = initialVisibility(tree)
const size = { width: 4, height: 4 }
type Assign = Pick<Character, 'mouthGroupId' | 'mouthMap' | 'eyeGroupId' | 'eyeMap' | 'blinkEnabled'>
const mouth = { mouthGroupId: '1', mouthMap: { closed: '1/0', a: '1/1' } }
const withHalf: Assign = { ...mouth, eyeGroupId: '2', eyeMap: { closed: '2/0', half: '2/1' } }
const noHalf: Assign = { ...mouth, eyeGroupId: '2', eyeMap: { closed: '2/0' } }
const noBlink: Assign = { ...mouth }

/** 合成に使われた表示状態（呼ばれた順） */
const composedStates = () => vi.mocked(composeTo).mock.calls.map((call) => call[2])
let bitmaps: FakeBitmap[]

beforeEach(() => {
  bitmaps = []
  vi.mocked(composeTo).mockClear()
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return {}
      }
    },
  )
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      const bitmap = { close: vi.fn() }
      bitmaps.push(bitmap)
      return bitmap
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FrameStore', () => {
  it('composes each distinct image once across repeated and overlapping prepare calls', async () => {
    const store = new FrameStore(tree, expression, withHalf, size)
    await Promise.all([
      store.prepare([
        { vowel: 'a', eye: 'open' },
        { vowel: 'a', eye: 'open' },
        { vowel: 'closed', eye: 'open' },
      ]),
      store.prepare([
        { vowel: 'a', eye: 'open' },
        { vowel: 'a', eye: 'closed' },
      ]),
    ])
    expect(composeTo).toHaveBeenCalledTimes(3)
    await store.prepare([
      { vowel: 'a', eye: 'closed' },
      { vowel: 'closed', eye: 'open' },
    ])
    expect(composeTo).toHaveBeenCalledTimes(3)
  })

  it('composes the eye layer for each eye state', async () => {
    const store = new FrameStore(tree, expression, withHalf, size)
    await store.prepare([{ vowel: 'a', eye: 'half' }])
    await store.prepare([{ vowel: 'a', eye: 'closed' }])
    const [half, closed] = composedStates()
    expect([half['2/0'], half['2/1'], half['2/2']]).toEqual([false, true, false])
    expect([closed['2/0'], closed['2/1'], closed['2/2']]).toEqual([true, false, false])
    expect(store.has({ vowel: 'a', eye: 'half' })).toBe(true)
    expect(store.get({ vowel: 'a', eye: 'half' })).not.toBe(store.get({ vowel: 'a', eye: 'closed' }))
  })

  it('uses the closed image for half when no half eye is assigned', async () => {
    const store = new FrameStore(tree, expression, noHalf, size)
    await store.prepare([{ vowel: 'a', eye: 'closed' }])
    expect(store.has({ vowel: 'a', eye: 'half' })).toBe(true)
    expect(store.get({ vowel: 'a', eye: 'half' })).toBe(store.get({ vowel: 'a', eye: 'closed' }))
    await store.prepare([{ vowel: 'a', eye: 'half' }])
    expect(composeTo).toHaveBeenCalledTimes(1)
  })

  it('maps every eye to the open image for a character that cannot blink', async () => {
    const store = new FrameStore(tree, expression, noBlink, size)
    expect(store.blink).toBeNull()
    await store.prepare([{ vowel: 'a', eye: 'open' }])
    const open = store.get({ vowel: 'a', eye: 'open' })
    for (const eye of ['half', 'closed'] as const) {
      expect(store.has({ vowel: 'a', eye })).toBe(true)
      expect(store.get({ vowel: 'a', eye })).toBe(open)
    }
    await store.prepare([
      { vowel: 'a', eye: 'closed' },
      { vowel: 'a', eye: 'half' },
    ])
    expect(composeTo).toHaveBeenCalledTimes(1)
    // 目は表情のまま（開き目）で合成される
    expect(composedStates()[0]['2/2']).toBe(true)
  })

  it('does not blink when blinking is switched off, even with eyes assigned', () => {
    expect(new FrameStore(tree, expression, { ...withHalf, blinkEnabled: false }, size).blink).toBeNull()
  })

  it('agrees between has and get, and get throws for an unprepared key', async () => {
    const store = new FrameStore(tree, expression, withHalf, size)
    await store.prepare([{ vowel: 'a', eye: 'open' }])
    expect(store.has({ vowel: 'a', eye: 'open' })).toBe(true)
    expect(store.get({ vowel: 'a', eye: 'open' })).toBe(bitmaps[0])
    for (const key of [
      { vowel: 'i', eye: 'open' },
      { vowel: 'a', eye: 'half' },
    ] as const) {
      expect(store.has(key)).toBe(false)
      expect(() => store.get(key)).toThrow(`口「${key.vowel}」・目「${key.eye}」の画像がありません`)
    }
  })

  it('closes every image on close and refuses to prepare afterwards', async () => {
    const store = new FrameStore(tree, expression, withHalf, size)
    await store.prepare([
      { vowel: 'a', eye: 'open' },
      { vowel: 'a', eye: 'closed' },
    ])
    store.close()
    expect(bitmaps.every((b) => b.close.mock.calls.length === 1)).toBe(true)
    expect(store.has({ vowel: 'a', eye: 'open' })).toBe(false)
    await expect(store.prepare([{ vowel: 'a', eye: 'open' }])).rejects.toThrow('閉じた立ち絵')
  })

  it('rejects prepare and closes the late image when closed during a compose', async () => {
    let finish: () => void = () => {}
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<FakeBitmap>((resolve) => {
            const bitmap = { close: vi.fn() }
            bitmaps.push(bitmap)
            finish = () => resolve(bitmap)
          }),
      ),
    )
    const store = new FrameStore(tree, expression, withHalf, size)
    const preparing = store.prepare([{ vowel: 'a', eye: 'open' }])
    store.close()
    finish()
    await expect(preparing).rejects.toThrow('閉じた立ち絵')
    expect(bitmaps[0].close).toHaveBeenCalledTimes(1)
    expect(store.has({ vowel: 'a', eye: 'open' })).toBe(false)
    expect(() => store.get({ vowel: 'a', eye: 'open' })).toThrow()
  })
})

describe('createFrameStore', () => {
  it('prepares every mouth with open eyes', async () => {
    const store = await createFrameStore(tree, expression, withHalf, size)
    expect(composeTo).toHaveBeenCalledTimes(VOWELS.length)
    for (const vowel of VOWELS) expect(store.has({ vowel, eye: 'open' })).toBe(true)
    expect(store.has({ vowel: 'a', eye: 'closed' })).toBe(false)
  })

  it('closes what it made when a compose fails', async () => {
    let calls = 0
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        if (++calls === 3) throw new Error('boom')
        const bitmap = { close: vi.fn() }
        bitmaps.push(bitmap)
        return bitmap
      }),
    )
    await expect(createFrameStore(tree, expression, withHalf, size)).rejects.toThrow('boom')
    expect(bitmaps.length).toBeGreaterThan(0)
    // 失敗より後に出来上がったものも含め、全部閉じられる
    await new Promise((r) => setTimeout(r, 0))
    expect(bitmaps.every((b) => b.close.mock.calls.length === 1)).toBe(true)
  })
})
