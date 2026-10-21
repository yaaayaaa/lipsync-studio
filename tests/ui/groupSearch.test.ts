import { describe, expect, it } from 'vitest'
import { searchGroups } from '../../src/ui/groupSearch'

const chars = [
  {
    id: 'z',
    name: 'ずんだもん',
    items: [
      { id: 'z1', name: 'ノーマル' },
      { id: 'z2', name: 'あまあま' },
    ],
  },
  {
    id: 'm',
    name: '四国めたん',
    items: [
      { id: 'm1', name: 'ノーマル' },
      { id: 'm2', name: 'ツンツン' },
    ],
  },
  { id: 'e', name: 'からっぽ', items: [] },
]

const ids = (result: ReturnType<typeof searchGroups>) => result.map((g) => [g.id, g.items.map((e) => e.id)])

describe('searchGroups', () => {
  it('lists every group that has an item when the query is empty', () => {
    expect(ids(searchGroups(chars, ''))).toEqual([
      ['z', ['z1', 'z2']],
      ['m', ['m1', 'm2']],
    ])
    expect(ids(searchGroups(chars, '   '))).toEqual(ids(searchGroups(chars, '')))
  })

  it('keeps all items of a group whose name matches', () => {
    expect(ids(searchGroups(chars, 'ずんだ'))).toEqual([['z', ['z1', 'z2']]])
  })

  it('keeps only the matching items otherwise', () => {
    expect(ids(searchGroups(chars, 'ノーマル'))).toEqual([
      ['z', ['z1']],
      ['m', ['m1']],
    ])
  })

  it('treats hiragana and katakana, and full and half width, as the same', () => {
    expect(ids(searchGroups(chars, 'のーまる'))).toEqual(ids(searchGroups(chars, 'ノーマル')))
    expect(ids(searchGroups(chars, 'ﾂﾝ'))).toEqual([['m', ['m2']]])
    expect(ids(searchGroups(chars, 'ズンダ'))).toEqual([['z', ['z1', 'z2']]])
  })

  it('matches every word separately, across the group and item names', () => {
    expect(ids(searchGroups(chars, 'めたん のーまる'))).toEqual([['m', ['m1']]])
    expect(ids(searchGroups(chars, 'めたん　あまあま'))).toEqual([])
  })

  it('ignores letter case', () => {
    const latin = [{ id: 'a', name: 'Alice', items: [{ id: 'a1', name: 'Smile' }] }]
    expect(ids(searchGroups(latin, 'alice SMILE'))).toEqual([['a', ['a1']]])
  })
})
