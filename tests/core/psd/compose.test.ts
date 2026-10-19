import { afterEach, describe, expect, it, vi } from 'vitest'
import { blendModeToComposite, buildDrawList } from '../../../src/core/psd/compose'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import { initialVisibility, setVisible } from '../../../src/core/psd/visibility'
import { layer } from '../../fixtures/makePsd'

afterEach(() => vi.restoreAllMocks())

describe('buildDrawList', () => {
  it('lists drawable leaves bottom to top with opacity and blend', () => {
    const tree = buildLayerTree([
      { ...layer('a', { image: true }), opacity: 0.5, blendMode: 'multiply' },
      layer('b', { image: true }),
    ])
    const list = buildDrawList(tree, initialVisibility(tree))
    expect(list).toEqual([
      { kind: 'layer', id: '0', opacity: 0.5, blend: 'multiply', clipping: false },
      { kind: 'layer', id: '1', opacity: 1, blend: 'source-over', clipping: false },
    ])
  })

  it('excludes children of a hidden parent', () => {
    const tree = buildLayerTree([
      layer('g', { children: [layer('c', { image: true })] }),
      layer('d', { image: true }),
    ])
    const state = setVisible(tree, initialVisibility(tree), '0', false)
    expect(buildDrawList(tree, state).map((o) => o.id)).toEqual(['1'])
  })

  it('excludes flip nodes, hidden leaves and leaves without an image', () => {
    const tree = buildLayerTree([
      layer('f:flipx', { image: true }),
      layer('noimg'),
      layer('off', { image: true, hidden: true }),
      layer('ok', { image: true }),
    ])
    expect(buildDrawList(tree, initialVisibility(tree)).map((o) => o.id)).toEqual(['3'])
  })

  it('nests visible groups and drops groups with nothing drawable', () => {
    const tree = buildLayerTree([
      { ...layer('g', { children: [layer('c', { image: true })] }), opacity: 0.8, blendMode: 'pass through' },
      layer('empty', { children: [layer('x')] }),
    ])
    expect(buildDrawList(tree, initialVisibility(tree))).toEqual([
      {
        kind: 'group',
        id: '0',
        opacity: 0.8,
        blend: 'pass-through',
        children: [{ kind: 'layer', id: '0/0', opacity: 1, blend: 'source-over', clipping: false }],
      },
    ])
  })

  it('marks clipping leaves', () => {
    const tree = buildLayerTree([layer('base', { image: true }), { ...layer('clip', { image: true }), clipping: true }])
    const list = buildDrawList(tree, initialVisibility(tree))
    expect(list.map((o) => o.kind === 'layer' && o.clipping)).toEqual([false, true])
  })
})

describe('blendModeToComposite', () => {
  it('maps supported modes', () => {
    expect(blendModeToComposite('multiply')).toBe('multiply')
    expect(blendModeToComposite('color dodge')).toBe('color-dodge')
    expect(blendModeToComposite('soft light')).toBe('soft-light')
    expect(blendModeToComposite('normal')).toBe('source-over')
    expect(blendModeToComposite(undefined)).toBe('source-over')
  })

  it('maps pass through', () => {
    expect(blendModeToComposite('pass through')).toBe('pass-through')
  })

  it('falls back to source-over and warns once per unknown mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(blendModeToComposite('vivid light')).toBe('source-over')
    expect(blendModeToComposite('vivid light')).toBe('source-over')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
