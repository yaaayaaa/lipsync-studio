import { describe, expect, it } from 'vitest'
import { conflictingGroupIds, groupOptions } from '../../../src/ui/character/groupOptions'
import type { LayerNode } from '../../../src/core/psd/types'

const node = (id: string, name: string, children: LayerNode[] = [], isGroup = children.length > 0): LayerNode =>
  ({ id, name, isGroup, children, kind: 'radio', flip: false }) as unknown as LayerNode

// 0: 親 > 1個目(0/0) > 孫(0/0/0) ; 0/1: 兄弟 ; 1: 無関係
const tree = [
  node('0', '親', [node('0/0', '口', [node('0/0/0', '孫', [node('0/0/0/0', 'leaf', [], false)])]), node('0/1', '兄弟', [node('0/1/0', 'x', [], false)])]),
  node('1', '無関係', [node('1/0', 'y', [], false)]),
]

describe('conflictingGroupIds', () => {
  it('is empty for null, undefined and ids missing from the tree', () => {
    expect(conflictingGroupIds(tree, null).size).toBe(0)
    expect(conflictingGroupIds(tree, undefined).size).toBe(0)
    expect(conflictingGroupIds(tree, '7/7').size).toBe(0)
  })

  it('contains the group itself, its descendants and its ancestors only', () => {
    expect([...conflictingGroupIds(tree, '0/0')].sort()).toEqual(['0', '0/0', '0/0/0', '0/0/0/0'])
  })

  it('leaves siblings and unrelated groups selectable', () => {
    const ids = conflictingGroupIds(tree, '0/0')
    expect(ids.has('0/1')).toBe(false)
    expect(ids.has('1')).toBe(false)
  })
})

describe('groupOptions', () => {
  it('lists every group when nothing is excluded', () => {
    expect(groupOptions(tree).map((o) => o.label)).toEqual(['無関係', '親', '親/兄弟', '親/口', '親/口/孫'])
  })

  it('drops the conflicting groups (equal, ancestor, descendant) but keeps a sibling inside a dropped ancestor', () => {
    expect(groupOptions(tree, conflictingGroupIds(tree, '0/0')).map((o) => o.label)).toEqual(['無関係', '親/兄弟'])
  })
})
