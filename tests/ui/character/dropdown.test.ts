import { describe, expect, it } from 'vitest'
import { dropdownReduce } from '../../../src/ui/character/dropdown'
import type { DropdownState } from '../../../src/ui/character/dropdown'

const closed: DropdownState = { open: false, active: 0 }
const openAt = (active: number): DropdownState => ({ open: true, active })
const key = (k: string, selected = 2, count = 5) => ({ type: 'key' as const, key: k, selected, count })

describe('dropdownReduce: toggle and close', () => {
  it('opens on the selected option and closes again', () => {
    expect(dropdownReduce(closed, { type: 'toggle', selected: 3 })).toEqual({ state: openAt(3), handled: true })
    expect(dropdownReduce(openAt(1), { type: 'toggle', selected: 3 })).toEqual({ state: { open: false, active: 1 }, handled: true })
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

  it('Tab closes but lets focus move on', () => {
    expect(dropdownReduce(openAt(3), key('Tab'))).toEqual({ state: { open: false, active: 3 }, handled: false })
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
