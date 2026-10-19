import { describe, expect, it } from 'vitest'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import {
  initialVisibility,
  isEffectivelyVisible,
  setVisible,
} from '../../../src/core/psd/visibility'
import { layer } from '../../fixtures/makePsd'

describe('initialVisibility', () => {
  it('keeps only the topmost visible radio sibling', () => {
    const tree = buildLayerTree([layer('*a'), layer('*b'), layer('*c', { hidden: true })])
    const s = initialVisibility(tree)
    expect([s['0'], s['1'], s['2']]).toEqual([false, true, false])
  })

  it('shows the topmost radio when none is visible', () => {
    const tree = buildLayerTree([layer('*a', { hidden: true }), layer('*b', { hidden: true })])
    const s = initialVisibility(tree)
    expect([s['0'], s['1']]).toEqual([false, true])
  })

  it('treats radios under different parents independently and leaves normal siblings alone', () => {
    const tree = buildLayerTree([
      layer('g1', { children: [layer('*x'), layer('*y', { hidden: true }), layer('n')] }),
      layer('g2', { children: [layer('*x', { hidden: true }), layer('*y', { hidden: true })] }),
    ])
    const s = initialVisibility(tree)
    expect([s['0/0'], s['0/1'], s['0/2']]).toEqual([true, false, true])
    expect([s['1/0'], s['1/1']]).toEqual([false, true])
    expect(Object.keys(s).sort()).toEqual(['0', '0/0', '0/1', '0/2', '1', '1/0', '1/1'])
  })

  it('forces ! layers on and flip layers off', () => {
    const tree = buildLayerTree([
      layer('!f', { hidden: true }),
      layer('m:flipx'),
      layer('plain'),
    ])
    const s = initialVisibility(tree)
    expect([s['0'], s['1'], s['2']]).toEqual([true, false, true])
  })
})

describe('setVisible', () => {
  const tree = buildLayerTree([layer('*a'), layer('*b'), layer('n'), layer('!f'), layer('x:flipy')])

  it('selecting a radio hides its radio siblings and returns a new object', () => {
    const s0 = initialVisibility(tree)
    const s1 = setVisible(tree, s0, '0', true)
    expect(s1).not.toBe(s0)
    expect([s1['0'], s1['1'], s1['2']]).toEqual([true, false, true])
    expect(s0['1']).toBe(true)
  })

  it('ignores false on a radio', () => {
    const s0 = initialVisibility(tree)
    expect(setVisible(tree, s0, '1', false)).toEqual(s0)
  })

  it('toggles normal layers', () => {
    const s = setVisible(tree, initialVisibility(tree), '2', false)
    expect(s['2']).toBe(false)
  })

  it('cannot hide forced or show flip layers', () => {
    const s0 = initialVisibility(tree)
    expect(setVisible(tree, s0, '3', false)['3']).toBe(true)
    expect(setVisible(tree, s0, '4', true)['4']).toBe(false)
  })
})

describe('isEffectivelyVisible', () => {
  it('is false when an ancestor group is hidden', () => {
    const tree = buildLayerTree([layer('g', { hidden: true, children: [layer('c')] })])
    const s = initialVisibility(tree)
    expect(s['0/0']).toBe(true)
    expect(isEffectivelyVisible(tree, s, '0/0')).toBe(false)
    expect(isEffectivelyVisible(tree, setVisible(tree, s, '0', true), '0/0')).toBe(true)
  })
})
