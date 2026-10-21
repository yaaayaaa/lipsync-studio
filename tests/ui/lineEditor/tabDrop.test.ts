import { describe, expect, it } from 'vitest'
import { isNoOpTabDrop } from '../../../src/ui/lineEditor/tabDrop'

const tabs = ['accent', 'pitch', 'length']

describe('isNoOpTabDrop', () => {
  it('treats the right half of the previous tab as the current place', () => {
    expect(isNoOpTabDrop({ tabs, dragged: 'pitch', over: 'accent', side: 'right' })).toBe(true)
  })

  it('treats the left half of the next tab as the current place', () => {
    expect(isNoOpTabDrop({ tabs, dragged: 'pitch', over: 'length', side: 'left' })).toBe(true)
  })

  it('treats either half of the dragged tab itself as the current place', () => {
    expect(isNoOpTabDrop({ tabs, dragged: 'pitch', over: 'pitch', side: 'left' })).toBe(true)
    expect(isNoOpTabDrop({ tabs, dragged: 'pitch', over: 'pitch', side: 'right' })).toBe(true)
  })

  it('moves the tab before the previous tab', () => {
    expect(isNoOpTabDrop({ tabs, dragged: 'pitch', over: 'accent', side: 'left' })).toBe(false)
  })

  it('moves the tab after the next tab', () => {
    expect(isNoOpTabDrop({ tabs, dragged: 'pitch', over: 'length', side: 'right' })).toBe(false)
  })

  it('moves the first tab to the end', () => {
    expect(isNoOpTabDrop({ tabs, dragged: 'accent', over: 'length', side: 'right' })).toBe(false)
    expect(isNoOpTabDrop({ tabs, dragged: 'accent', over: 'pitch', side: 'left' })).toBe(true)
  })

  it('does not hide the line when a tab is not in the group', () => {
    expect(isNoOpTabDrop({ tabs, dragged: 'preview', over: 'accent', side: 'right' })).toBe(false)
    expect(isNoOpTabDrop({ tabs, dragged: 'pitch', over: 'preview', side: 'right' })).toBe(false)
  })
})
