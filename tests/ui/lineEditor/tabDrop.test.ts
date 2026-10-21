import { describe, expect, it } from 'vitest'
import { dropGapAtX, gapX, isNoOpDrop } from '../../../src/ui/lineEditor/tabDrop'

const tabs = ['accent', 'pitch', 'length']

const rects = [
  { left: 10, right: 100 },
  { left: 100, right: 160 },
  { left: 160, right: 220 },
]

describe('dropGapAtX', () => {
  it('puts the right half of a tab and the left half of the next tab on the same gap', () => {
    expect(dropGapAtX(rects, 140)).toBe(2)
    expect(dropGapAtX(rects, 170)).toBe(2)
  })

  it('gives one gap on both sides of a boundary, even a fractional pixel apart', () => {
    expect(dropGapAtX(rects, 159.75)).toBe(2)
    expect(dropGapAtX(rects, 160)).toBe(2)
    expect(dropGapAtX(rects, 160.25)).toBe(2)
  })

  it('numbers the gap before the first tab 0 and after the last tab tabs.length', () => {
    expect(dropGapAtX(rects, 20)).toBe(0)
    expect(dropGapAtX(rects, 300)).toBe(3)
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
