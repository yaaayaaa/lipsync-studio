import { describe, expect, it } from 'vitest'
import { dropGapAtTab, gapX, isNoOpDrop } from '../../../src/ui/lineEditor/tabDrop'

const tabs = ['accent', 'pitch', 'length']

describe('dropGapAtTab', () => {
  it('puts the right half of a tab and the left half of the next tab on the same gap', () => {
    expect(dropGapAtTab(tabs, 'pitch', 'right')).toBe(2)
    expect(dropGapAtTab(tabs, 'length', 'left')).toBe(2)
  })

  it('numbers the gap before the first tab 0 and after the last tab tabs.length', () => {
    expect(dropGapAtTab(tabs, 'accent', 'left')).toBe(0)
    expect(dropGapAtTab(tabs, 'length', 'right')).toBe(3)
  })

  it('has no gap for a tab that is not in the group', () => {
    expect(dropGapAtTab(tabs, 'preview', 'left')).toBeNull()
  })
})

describe('isNoOpDrop', () => {
  it('treats the gaps on both sides of the dragged tab as its current place', () => {
    expect(isNoOpDrop(tabs, 'pitch', 1)).toBe(true)
    expect(isNoOpDrop(tabs, 'pitch', 2)).toBe(true)
  })

  it('moves the tab to any other gap', () => {
    expect(isNoOpDrop(tabs, 'pitch', 0)).toBe(false)
    expect(isNoOpDrop(tabs, 'pitch', 3)).toBe(false)
    expect(isNoOpDrop(tabs, 'accent', 3)).toBe(false)
  })

  it('treats the end as the current place of the last tab', () => {
    expect(isNoOpDrop(tabs, 'length', 3)).toBe(true)
  })

  it('always moves a tab that comes from another group', () => {
    expect(isNoOpDrop(tabs, 'preview', 0)).toBe(false)
    expect(isNoOpDrop(tabs, 'preview', 3)).toBe(false)
  })
})

describe('gapX', () => {
  const rects = [
    { left: 10, right: 100 },
    { left: 100, right: 160 },
    { left: 160, right: 220 },
  ]

  it('uses the left edge of the tab after the gap', () => {
    expect(gapX(rects, 0)).toBe(10)
    expect(gapX(rects, 2)).toBe(160)
  })

  it('uses the right edge of the last tab for the end', () => {
    expect(gapX(rects, 3)).toBe(220)
  })

  it('has no position outside the tabs', () => {
    expect(gapX(rects, 4)).toBeNull()
    expect(gapX([], 0)).toBeNull()
  })
})
