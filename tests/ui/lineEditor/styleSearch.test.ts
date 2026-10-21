import { describe, expect, it } from 'vitest'
import { searchStyles } from '../../../src/ui/lineEditor/styleSearch'

const chars = [
  {
    id: 'z',
    name: 'ずんだもん',
    expressions: [
      { id: 'z1', name: 'ノーマル' },
      { id: 'z2', name: 'あまあま' },
    ],
  },
  {
    id: 'm',
    name: '四国めたん',
    expressions: [
      { id: 'm1', name: 'ノーマル' },
      { id: 'm2', name: 'ツンツン' },
    ],
  },
  { id: 'e', name: 'からっぽ', expressions: [] },
]

const ids = (result: ReturnType<typeof searchStyles<(typeof chars)[number]>>) =>
  result.map((g) => [g.character.id, g.expressions.map((e) => e.id)])

describe('searchStyles', () => {
  it('lists every character that has a style when the query is empty', () => {
    expect(ids(searchStyles(chars, ''))).toEqual([
      ['z', ['z1', 'z2']],
      ['m', ['m1', 'm2']],
    ])
    expect(ids(searchStyles(chars, '   '))).toEqual(ids(searchStyles(chars, '')))
  })

  it('keeps all styles of a character whose name matches', () => {
    expect(ids(searchStyles(chars, 'ずんだ'))).toEqual([['z', ['z1', 'z2']]])
  })

  it('keeps only the matching styles otherwise', () => {
    expect(ids(searchStyles(chars, 'ノーマル'))).toEqual([
      ['z', ['z1']],
      ['m', ['m1']],
    ])
  })

  it('treats hiragana and katakana, and full and half width, as the same', () => {
    expect(ids(searchStyles(chars, 'のーまる'))).toEqual(ids(searchStyles(chars, 'ノーマル')))
    expect(ids(searchStyles(chars, 'ﾂﾝ'))).toEqual([['m', ['m2']]])
    expect(ids(searchStyles(chars, 'ズンダ'))).toEqual([['z', ['z1', 'z2']]])
  })

  it('matches every word separately, across the character and style names', () => {
    expect(ids(searchStyles(chars, 'めたん のーまる'))).toEqual([['m', ['m1']]])
    expect(ids(searchStyles(chars, 'めたん　あまあま'))).toEqual([])
  })

  it('ignores letter case', () => {
    const latin = [{ id: 'a', name: 'Alice', expressions: [{ id: 'a1', name: 'Smile' }] }]
    expect(ids(searchStyles(latin, 'alice SMILE'))).toEqual([['a', ['a1']]])
  })
})
