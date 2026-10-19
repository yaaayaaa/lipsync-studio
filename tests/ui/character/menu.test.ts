import { describe, expect, it } from 'vitest'
import { menuReduce } from '../../../src/ui/character/menu'
import type { MenuState } from '../../../src/ui/character/menu'

const closed: MenuState = { open: false, active: 0 }
const openAt = (active: number): MenuState => ({ open: true, active })
const key = (k: string, count = 3) => ({ type: 'key' as const, key: k, count })

describe('menuReduce: the menu button', () => {
  it('click toggles; opening focuses the first item, closing returns focus to the button', () => {
    expect(menuReduce(closed, { type: 'toggle' })).toEqual({ state: openAt(0), handled: true })
    expect(menuReduce(openAt(2), { type: 'toggle' })).toEqual({ state: { open: false, active: 2 }, focusButton: true, handled: true })
  })

  it.each(['Enter', ' ', 'ArrowDown'])('%j opens on the first item', (k) => {
    expect(menuReduce(closed, key(k))).toEqual({ state: openAt(0), handled: true })
  })

  it('ArrowUp opens on the last item', () => {
    expect(menuReduce(closed, key('ArrowUp'))).toEqual({ state: openAt(2), handled: true })
  })

  it('leaves other keys alone while closed', () => {
    expect(menuReduce(closed, key('Tab')).handled).toBe(false)
    expect(menuReduce(closed, key('Escape')).handled).toBe(false)
  })
})

describe('menuReduce: inside the open menu', () => {
  it('ArrowDown/ArrowUp move and wrap around', () => {
    expect(menuReduce(openAt(0), key('ArrowDown')).state).toEqual(openAt(1))
    expect(menuReduce(openAt(2), key('ArrowDown')).state).toEqual(openAt(0))
    expect(menuReduce(openAt(1), key('ArrowUp')).state).toEqual(openAt(0))
    expect(menuReduce(openAt(0), key('ArrowUp')).state).toEqual(openAt(2))
  })

  it('Home/End jump to the ends', () => {
    expect(menuReduce(openAt(1), key('Home')).state).toEqual(openAt(0))
    expect(menuReduce(openAt(0), key('End')).state).toEqual(openAt(2))
  })

  it.each(['Enter', ' '])('%j activates the focused item, closes and returns focus first', (k) => {
    expect(menuReduce(openAt(1), key(k))).toEqual({
      state: { open: false, active: 1 },
      activate: 1,
      focusButton: true,
      handled: true,
    })
  })

  it('Escape closes and returns focus to the button', () => {
    expect(menuReduce(openAt(1), key('Escape'))).toEqual({ state: { open: false, active: 1 }, focusButton: true, handled: true })
  })

  it('Tab closes and continues from the button', () => {
    expect(menuReduce(openAt(1), key('Tab'))).toEqual({ state: { open: false, active: 1 }, focusButton: true, handled: false })
  })

  it('ignores other keys', () => {
    expect(menuReduce(openAt(1), key('x'))).toEqual({ state: openAt(1), handled: false })
  })

  it('clicking an item activates it', () => {
    expect(menuReduce(openAt(0), { type: 'click', index: 2 })).toEqual({
      state: { open: false, active: 2 },
      activate: 2,
      focusButton: true,
      handled: true,
    })
  })

  it('hover moves focus to the hovered item', () => {
    expect(menuReduce(openAt(0), { type: 'hover', index: 1 })).toEqual({ state: openAt(1), handled: true })
  })

  it('closing from outside does not move focus', () => {
    expect(menuReduce(openAt(1), { type: 'close' })).toEqual({ state: { open: false, active: 1 }, handled: true })
  })
})

describe('menuReduce: disabled items', () => {
  // 0 と 2 を無効にした 3 項目のメニュー
  const D = [true, false, true]

  it('opens on the first usable item instead of a disabled one', () => {
    expect(menuReduce(closed, { type: 'toggle', count: 3 }, D)).toEqual({ state: openAt(1), handled: true })
    expect(menuReduce(closed, key('ArrowUp', 3), D)).toEqual({ state: openAt(1), handled: true })
  })

  it('jumps over disabled items when moving, and still wraps', () => {
    expect(menuReduce(openAt(0), key('ArrowDown', 3), D).state).toEqual(openAt(1))
    expect(menuReduce(openAt(1), key('ArrowDown', 3), D).state).toEqual(openAt(1)) // 自分自身へ戻る(次も無効)
    expect(menuReduce(openAt(1), key('ArrowUp', 3), D).state).toEqual(openAt(1))
  })

  it('Home/End land on the usable ends', () => {
    expect(menuReduce(openAt(1), key('Home', 3), D).state).toEqual(openAt(1))
    expect(menuReduce(openAt(1), key('End', 3), D).state).toEqual(openAt(1))
  })

  it.each(['Enter', ' '])('%j on a disabled item keeps the menu open and activates nothing', (k) => {
    expect(menuReduce(openAt(2), key(k, 3), D)).toEqual({ state: openAt(2), handled: true })
  })

  it('clicking a disabled item keeps the menu open and activates nothing', () => {
    expect(menuReduce(openAt(0), { type: 'click', index: 2 }, D)).toEqual({ state: openAt(0), handled: true })
  })

  it('hovering a disabled item leaves the highlight where it was', () => {
    expect(menuReduce(openAt(1), { type: 'hover', index: 2 }, D)).toEqual({ state: openAt(1), handled: true })
  })

  it('a disabled item is still closable by Escape', () => {
    expect(menuReduce(openAt(2), key('Escape', 3), D)).toEqual({
      state: { open: false, active: 2 },
      focusButton: true,
      handled: true,
    })
  })

  it('all-disabled menus stay put instead of looping forever', () => {
    const all = [true, true, true]
    expect(menuReduce(closed, { type: 'toggle', count: 3 }, all).state.active).toBe(0)
    expect(menuReduce(openAt(1), key('ArrowDown', 3), all).state).toEqual(openAt(1))
  })

  it('an enabled item behaves exactly as before', () => {
    expect(menuReduce(openAt(1), key('Enter', 3), [false, false, true])).toEqual({
      state: { open: false, active: 1 },
      activate: 1,
      focusButton: true,
      handled: true,
    })
  })
})
