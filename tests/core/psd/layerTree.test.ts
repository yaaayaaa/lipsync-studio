import { describe, expect, it } from 'vitest'
import { buildLayerTree, findNode, parentId } from '../../../src/core/psd/layerTree'
import { layer } from '../../fixtures/makePsd'

describe('buildLayerTree', () => {
  it('applies PSDTool name rules', () => {
    const tree = buildLayerTree([layer('*目'), layer('!体'), layer('髪:flipx'), layer('普通')])
    expect(tree.map((n) => n.kind)).toEqual(['radio', 'forced', 'normal', 'normal'])
    expect(tree.map((n) => n.name)).toEqual(['目', '体', '髪:flipx', '普通'])
    expect(tree.map((n) => n.rawName)).toEqual(['*目', '!体', '髪:flipx', '普通'])
    expect(tree.map((n) => n.flip)).toEqual([false, false, true, false])
  })

  it('detects flipy / flipxy and applies rules to groups', () => {
    const tree = buildLayerTree([layer('a:flipy'), layer('b:flipxy'), layer('*口', { children: [layer('x')] })])
    expect(tree[0].flip).toBe(true)
    expect(tree[1].flip).toBe(true)
    expect(tree[2]).toMatchObject({ kind: 'radio', name: '口', isGroup: true })
  })

  it('builds slash-joined ids for children', () => {
    const tree = buildLayerTree([layer('a'), layer('g', { children: [layer('c0'), layer('c1')] })])
    expect(tree[1].id).toBe('1')
    expect(tree[1].children.map((c) => c.id)).toEqual(['1/0', '1/1'])
    expect(tree[0].isGroup).toBe(false)
  })

  it('maps hidden to initiallyVisible', () => {
    const tree = buildLayerTree([layer('a', { hidden: true }), layer('b')])
    expect(tree[0].initiallyVisible).toBe(false)
    expect(tree[1].initiallyVisible).toBe(true)
  })
})

describe('findNode / parentId', () => {
  const tree = buildLayerTree([layer('a'), layer('g', { children: [layer('c')] })])
  it('finds nodes by id', () => {
    expect(findNode(tree, '1/0')?.name).toBe('c')
    expect(findNode(tree, '1')?.name).toBe('g')
    expect(findNode(tree, '9')).toBeUndefined()
    expect(findNode(tree, '0/0')).toBeUndefined()
  })
  it('computes parent ids', () => {
    expect(parentId('1/0')).toBe('1')
    expect(parentId('1')).toBeNull()
  })
})
