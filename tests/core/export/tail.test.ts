import { describe, expect, it } from 'vitest'
import { clampTail, effectiveTail, TAIL_RANGE } from '../../../src/core/export/tail'

describe('clampTail', () => {
  it('clamps into the range', () => {
    expect(clampTail(-1)).toBe(0)
    expect(clampTail(12)).toBe(TAIL_RANGE.max)
  })

  it('rounds to 0.1 steps', () => {
    expect(clampTail(1.26)).toBe(1.3)
    expect(clampTail(0.3)).toBe(0.3)
  })

  it('treats non-finite values as 0', () => {
    expect(clampTail(NaN)).toBe(0)
    expect(clampTail(Infinity)).toBe(0)
  })
})

describe('effectiveTail', () => {
  it('falls back to the default when the line has no value', () => {
    expect(effectiveTail({}, { tailSeconds: 2 })).toBe(2)
  })

  it('uses the line value, including 0', () => {
    expect(effectiveTail({ tailSeconds: 0 }, { tailSeconds: 2 })).toBe(0)
    expect(effectiveTail({ tailSeconds: 1.5 }, { tailSeconds: 2 })).toBe(1.5)
  })

  it('clamps both sources', () => {
    expect(effectiveTail({ tailSeconds: 99 }, { tailSeconds: 2 })).toBe(10)
    expect(effectiveTail({}, { tailSeconds: -3 })).toBe(0)
  })
})
