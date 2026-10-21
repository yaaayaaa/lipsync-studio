import { describe, expect, it } from 'vitest'
import { dropdownReduce, placePopover } from '../../src/ui/dropdownState'
import type { DropdownState } from '../../src/ui/dropdownState'

const closed: DropdownState = { open: false, active: 0 }
const openAt = (active: number): DropdownState => ({ open: true, active })
const key = (k: string, selected = 2, count = 5) => ({ type: 'key' as const, key: k, selected, count })

describe('dropdownReduce: toggle and close', () => {
  it('opens on the selected option and closes again', () => {
    expect(dropdownReduce(closed, { type: 'toggle', selected: 3 })).toEqual({ state: openAt(3), handled: true })
    // ボタンで閉じたらフォーカスをボタンに戻す（Safari はクリックでボタンにフォーカスしない）
    expect(dropdownReduce(openAt(1), { type: 'toggle', selected: 3 })).toEqual({
      state: { open: false, active: 1 },
      focusButton: true,
      handled: true,
    })
  })

  it('opens on the first option when nothing valid is selected', () => {
    expect(dropdownReduce(closed, { type: 'toggle', selected: -1 }).state).toEqual(openAt(0))
  })

  it('closes from outside without moving focus', () => {
    expect(dropdownReduce(openAt(2), { type: 'close' })).toEqual({ state: { open: false, active: 2 }, handled: true })
  })
})

describe('dropdownReduce: keys while closed', () => {
  it.each(['ArrowDown', 'ArrowUp', 'Enter', ' '])('%j opens on the selected option', (k) => {
    expect(dropdownReduce(closed, key(k, 2))).toEqual({ state: openAt(2), handled: true })
  })

  it('leaves other keys (Tab, letters, Escape) to the browser', () => {
    for (const k of ['Tab', 'a', 'Escape']) expect(dropdownReduce(closed, key(k)).handled).toBe(false)
  })
})

describe('dropdownReduce: keys while open', () => {
  it('moves with ArrowDown/ArrowUp and stops at the ends', () => {
    expect(dropdownReduce(openAt(1), key('ArrowDown')).state).toEqual(openAt(2))
    expect(dropdownReduce(openAt(4), key('ArrowDown')).state).toEqual(openAt(4))
    expect(dropdownReduce(openAt(1), key('ArrowUp')).state).toEqual(openAt(0))
    expect(dropdownReduce(openAt(0), key('ArrowUp')).state).toEqual(openAt(0))
  })

  it('jumps with Home/End', () => {
    expect(dropdownReduce(openAt(2), key('Home')).state).toEqual(openAt(0))
    expect(dropdownReduce(openAt(2), key('End')).state).toEqual(openAt(4))
  })

  it.each(['Enter', ' '])('%j chooses the active option, closes and returns focus', (k) => {
    expect(dropdownReduce(openAt(3), key(k))).toEqual({
      state: { open: false, active: 3 },
      choose: 3,
      focusButton: true,
      handled: true,
    })
  })

  it('Escape closes without choosing and returns focus', () => {
    expect(dropdownReduce(openAt(3), key('Escape'))).toEqual({
      state: { open: false, active: 3 },
      focusButton: true,
      handled: true,
    })
  })

  it('Tab closes, puts focus back on the button and lets the browser move on from there', () => {
    expect(dropdownReduce(openAt(3), key('Tab'))).toEqual({
      state: { open: false, active: 3 },
      focusButton: true,
      handled: false,
    })
  })

  it('ignores other keys', () => {
    expect(dropdownReduce(openAt(3), key('x'))).toEqual({ state: openAt(3), handled: false })
  })

  it('clamps an out-of-range active index when the options shrink', () => {
    expect(dropdownReduce(openAt(9), key('ArrowUp', 0, 3)).state).toEqual(openAt(1))
    expect(dropdownReduce(openAt(9), key('Enter', 0, 3)).choose).toBe(2)
  })
})

describe('dropdownReduce: hover', () => {
  it('moves the active option to the hovered one while open', () => {
    expect(dropdownReduce(openAt(0), { type: 'hover', index: 3 })).toEqual({ state: openAt(3), handled: true })
  })
})

describe('placePopover', () => {
  const viewport = { width: 1000, height: 800 }
  const anchor = (x: number, y: number, width = 150, height = 30) => ({ x, y, width, height })

  it('opens below with the needed height when it fits, at least as wide as the button or the minimum', () => {
    expect(placePopover(anchor(100, 100), viewport, 200)).toEqual({ left: 100, width: 200, top: 132, maxHeight: 280 })
    expect(placePopover(anchor(100, 100, 300), viewport, 200)?.width).toBe(300)
  })

  it('opens above when there is more room above than below', () => {
    expect(placePopover(anchor(100, 700), viewport, 280)).toEqual({ left: 100, width: 200, bottom: 102, maxHeight: 280 })
  })

  it('keeps the popover inside the viewport horizontally', () => {
    expect(placePopover(anchor(900, 100), viewport, 100)?.left).toBe(792)
    expect(placePopover(anchor(-20, 100), viewport, 100)?.left).toBe(8)
  })

  it('never returns a negative or tiny max height', () => {
    // 画面が低くて上下とも余白がほとんどない
    const p = placePopover(anchor(100, 5, 150, 30), { width: 1000, height: 40 }, 200)
    expect(p?.maxHeight).toBe(96)
  })

  it('returns null when the button has scrolled out of the viewport', () => {
    expect(placePopover(anchor(100, -40), viewport, 100)).toBeNull()
    expect(placePopover(anchor(100, 800), viewport, 100)).toBeNull()
    expect(placePopover(anchor(-200, 100), viewport, 100)).toBeNull()
    expect(placePopover(anchor(1000, 100), viewport, 100)).toBeNull()
  })
})

describe('placePopover options for menus', () => {
  const viewport = { width: 1000, height: 800 }

  it("can align the popover's right edge with the button and use a smaller minimum width", () => {
    // ボタン x 170〜194、幅 140 のメニューは右端をボタンにそろえる（左端 54）
    expect(placePopover({ x: 170, y: 100, width: 24, height: 24 }, viewport, 80, { align: 'end', minWidth: 140 })).toEqual({
      left: 54,
      width: 140,
      top: 126,
      maxHeight: 280,
    })
  })

  it('still keeps an end-aligned popover on screen', () => {
    expect(placePopover({ x: 20, y: 100, width: 24, height: 24 }, viewport, 80, { align: 'end', minWidth: 140 })?.left).toBe(8)
  })
})

describe('placePopover gap option', () => {
  it('leaves the requested gap between the button and the popover (default 2)', () => {
    const anchor = { x: 100, y: 100, width: 24, height: 24 }
    expect(placePopover(anchor, { width: 1000, height: 800 }, 80, { gap: 4 })?.top).toBe(128)
    expect(placePopover({ x: 100, y: 700, width: 24, height: 24 }, { width: 1000, height: 800 }, 280, { gap: 4 })?.bottom).toBe(104)
    expect(placePopover(anchor, { width: 1000, height: 800 }, 80)?.top).toBe(126)
  })
})
