import { describe, expect, it } from 'vitest'
import { applyMouth, resolveMouthLayer } from '../../../src/core/character/mouth'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import type { VisibilityState } from '../../../src/core/psd/types'
import { initialVisibility } from '../../../src/core/psd/visibility'
import { layer } from '../../fixtures/makePsd'

describe('resolveMouthLayer', () => {
  it('returns the mapped layer, falls back to closed, then null', () => {
    expect(resolveMouthLayer({ a: '3/1', closed: '3/0' }, 'a')).toBe('3/1')
    expect(resolveMouthLayer({ closed: '3/0' }, 'a')).toBe('3/0')
    expect(resolveMouthLayer({ closed: '3/0' }, 'n')).toBe('3/0')
    expect(resolveMouthLayer({ n: '3/2', closed: '3/0' }, 'n')).toBe('3/2')
    expect(resolveMouthLayer({}, 'a')).toBeNull()
  })
})

describe('applyMouth', () => {
  const tree = buildLayerTree([
    layer('body'),
    layer('x'),
    layer('y'),
    layer('mouth', { children: [layer('*closed'), layer('*a', { hidden: true }), layer('*i', { hidden: true })] }),
  ])
  // スタイル側で 3/1 が表示中の状態
  const base: VisibilityState = { ...initialVisibility(tree), '3/0': false, '3/1': true, '3/2': false }

  it('shows only the requested mouth, overriding the radio state', () => {
    const s = applyMouth(tree, base, '3', '3/2')
    expect([s['3/0'], s['3/1'], s['3/2']]).toEqual([false, false, true])
    expect(s['3']).toBe(base['3'])
    expect(base['3/1']).toBe(true)
  })

  it('returns the state unchanged when the layer or group is null', () => {
    expect(applyMouth(tree, base, '3', null)).toEqual(base)
    expect(applyMouth(tree, base, null, '3/2')).toEqual(base)
  })
})
