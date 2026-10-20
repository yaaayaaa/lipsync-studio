import { describe, expect, it } from 'vitest'
import { isPlayShortcut, ownsSpace } from '../../../src/ui/lineEditor/playShortcut'

const press = (key: string, mods: Partial<Parameters<typeof isPlayShortcut>[0]> = {}) =>
  isPlayShortcut({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    repeat: false,
    ...mods,
  })

describe('isPlayShortcut', () => {
  it('plays on a bare Space', () => {
    expect(press(' ')).toBe(true)
  })

  it('ignores other keys, modified Space, held-down repeats and IME composition', () => {
    expect(press('Enter')).toBe(false)
    expect(press('k')).toBe(false)
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'repeat', 'isComposing'] as const) {
      expect(press(' ', { [mod]: true })).toBe(false)
    }
  })
})

describe('ownsSpace', () => {
  const at = (selectorMatched: boolean) => ({ closest: () => (selectorMatched ? ({} as Element) : null) })

  it('leaves Space to open dropdowns, menus and dialogs', () => {
    expect(ownsSpace(at(true))).toBe(true)
  })

  it('takes Space everywhere else, including without focus', () => {
    expect(ownsSpace(at(false))).toBe(false)
    expect(ownsSpace(null)).toBe(false)
  })
})
