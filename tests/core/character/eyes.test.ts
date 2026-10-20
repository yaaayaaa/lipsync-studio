import { describe, expect, it } from 'vitest'
import { applyEyes, blinkSpec, eyeLayer } from '../../../src/core/character/eyes'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import type { VisibilityState } from '../../../src/core/psd/types'
import { initialVisibility } from '../../../src/core/psd/visibility'
import { layer } from '../../fixtures/makePsd'

describe('blinkSpec', () => {
  it('is null without a group, a map or a closed eye', () => {
    expect(blinkSpec({ eyeGroupId: null, eyeMap: { closed: '1/0' } })).toBeNull()
    expect(blinkSpec({ eyeMap: { closed: '1/0' } })).toBeNull()
    expect(blinkSpec({ eyeGroupId: '1' })).toBeNull()
    expect(blinkSpec({ eyeGroupId: '1', eyeMap: { half: '1/1' } })).toBeNull()
  })
  it('builds a spec, with half null when unassigned', () => {
    expect(blinkSpec({ eyeGroupId: '1', eyeMap: { closed: '1/0' } })).toEqual({ groupId: '1', closed: '1/0', half: null })
    expect(blinkSpec({ eyeGroupId: '1', eyeMap: { closed: '1/0', half: '1/1' } })).toEqual({
      groupId: '1',
      closed: '1/0',
      half: '1/1',
    })
  })
})

describe('eyeLayer', () => {
  const spec = { groupId: '1', closed: '1/0', half: '1/1' }
  it('returns null for open, half for half, closed for closed', () => {
    expect(eyeLayer(spec, 'open')).toBeNull()
    expect(eyeLayer(spec, 'half')).toBe('1/1')
    expect(eyeLayer(spec, 'closed')).toBe('1/0')
  })
  it('uses closed for half when half is unassigned', () => {
    expect(eyeLayer({ ...spec, half: null }, 'half')).toBe('1/0')
  })
})

describe('applyEyes', () => {
  const tree = buildLayerTree([
    layer('body'),
    layer('eyes', { children: [layer('*closed', { hidden: true }), layer('*half', { hidden: true }), layer('*open')] }),
  ])
  const base: VisibilityState = initialVisibility(tree)
  const spec = { groupId: '1', closed: '1/0', half: '1/1' }

  it('returns the state as is when open or without a spec', () => {
    expect(applyEyes(tree, base, spec, 'open')).toBe(base)
    expect(applyEyes(tree, base, null, 'closed')).toBe(base)
  })
  it('shows only the closed eye when closed', () => {
    const s = applyEyes(tree, base, spec, 'closed')
    expect([s['1/0'], s['1/1'], s['1/2']]).toEqual([true, false, false])
    expect(base['1/2']).toBe(true)
  })
  it('shows the half eye, or closed when half is unassigned', () => {
    const half = applyEyes(tree, base, spec, 'half')
    expect([half['1/0'], half['1/1'], half['1/2']]).toEqual([false, true, false])
    const fallback = applyEyes(tree, base, { ...spec, half: null }, 'half')
    expect([fallback['1/0'], fallback['1/1'], fallback['1/2']]).toEqual([true, false, false])
  })
  it('returns the state as is when the group is not in the tree', () => {
    expect(applyEyes(tree, base, { ...spec, groupId: '99' }, 'closed')).toEqual(base)
  })
  it('leaves the eyes open when the closed eye is not a child of the group (stale PSD)', () => {
    // '1/9' はもうない、'0' はあるが目のグループの子ではない
    for (const closed of ['1/9', '0']) {
      for (const eye of ['closed', 'half'] as const) {
        expect(applyEyes(tree, base, { ...spec, closed }, eye)).toEqual(base)
      }
    }
  })
  it('uses the closed eye when the half eye is not a child of the group', () => {
    for (const half of ['1/9', '0']) {
      const s = applyEyes(tree, base, { ...spec, half }, 'half')
      expect([s['0'], s['1/0'], s['1/1'], s['1/2']]).toEqual([true, true, false, false])
    }
  })
})
