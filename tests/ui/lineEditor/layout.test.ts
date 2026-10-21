import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAYOUT,
  LIST_WIDTH_RANGE,
  PHRASE_HEIGHT_MIN,
  loadLayout,
  saveLayout,
} from '../../../src/ui/lineEditor/layout'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

const KEY = 'zunda-lipsync.lineEditorLayout'

describe('line editor layout', () => {
  it('uses the default sizes when nothing is saved', () => {
    expect(loadLayout(memoryStorage())).toEqual(DEFAULT_LAYOUT)
  })

  it('reads back what was saved', () => {
    const storage = memoryStorage()
    saveLayout({ listWidth: 300, phraseHeight: 260 }, storage)
    expect(loadLayout(storage)).toEqual({ listWidth: 300, phraseHeight: 260 })
  })

  it('keeps saved sizes inside the allowed range', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ listWidth: 5000, phraseHeight: 10 }) })
    expect(loadLayout(storage)).toEqual({ listWidth: LIST_WIDTH_RANGE.max, phraseHeight: PHRASE_HEIGHT_MIN })
  })

  it('falls back per field for broken or partial data', () => {
    expect(loadLayout(memoryStorage({ [KEY]: '{oops' }))).toEqual(DEFAULT_LAYOUT)
    expect(loadLayout(memoryStorage({ [KEY]: '[1,2]' }))).toEqual(DEFAULT_LAYOUT)
    expect(loadLayout(memoryStorage({ [KEY]: JSON.stringify({ listWidth: 'wide', phraseHeight: 200 }) }))).toEqual({
      listWidth: DEFAULT_LAYOUT.listWidth,
      phraseHeight: 200,
    })
  })

  it('works when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadLayout(blocked)).toEqual(DEFAULT_LAYOUT)
    expect(() => saveLayout(DEFAULT_LAYOUT, blocked)).not.toThrow()
  })
})
