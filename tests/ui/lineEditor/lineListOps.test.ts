import { describe, expect, it } from 'vitest'
import type { Character, ScriptLine } from '../../../src/core/character/types'
import {
  appendLine,
  duplicateLine,
  insertLine,
  moveLine,
  neighborAfterRemoval,
  removeLine,
} from '../../../src/ui/lineEditor/lineListOps'

const line = (id: string, more: Partial<ScriptLine> = {}): ScriptLine => ({
  id,
  text: id,
  characterId: 'c1',
  expressionId: 'e1',
  speedScale: 1,
  ...more,
})
const ids = (lines: ScriptLine[]) => lines.map((l) => l.id).join('')

const character = (id: string, expressionIds: string[]): Character => ({
  id,
  name: id,
  psdFileName: `${id}.psd`,
  voice: null,
  mouthGroupId: null,
  mouthMap: {},
  expressions: expressionIds.map((e) => ({ id: e, name: e, visibility: {} })),
})
const characters = [character('c1', ['e1', 'e2']), character('c2', ['f1'])]

describe('appendLine', () => {
  it('adds an empty line that continues the character and style of the last line', () => {
    const lines = [line('a', { expressionId: 'e2', speedScale: 1.5 })]
    expect(appendLine(lines, characters, 'n')).toEqual([
      lines[0],
      { id: 'n', text: '', characterId: 'c1', expressionId: 'e2', speedScale: 1 },
    ])
  })

  it('falls back to the first character and its first style when the last line has none', () => {
    expect(appendLine([], characters, 'n')).toEqual([
      { id: 'n', text: '', characterId: 'c1', expressionId: 'e1', speedScale: 1 },
    ])
    const deleted = [line('a', { characterId: 'gone', expressionId: 'x' })]
    expect(appendLine(deleted, characters, 'n')[1]).toMatchObject({ characterId: 'c1', expressionId: 'e1' })
  })

  it('leaves the character empty when there are no characters', () => {
    expect(appendLine([], [], 'n')).toEqual([
      { id: 'n', text: '', characterId: null, expressionId: null, speedScale: 1 },
    ])
  })
})

describe('insertLine', () => {
  const lines = [line('a', { characterId: 'c2', expressionId: 'f1' }), line('b', { expressionId: 'e2' })]

  it('inserts at the index and continues the line above', () => {
    const result = insertLine(lines, characters, 'n', 1)
    expect(ids(result)).toBe('anb')
    expect(result[1]).toMatchObject({ text: '', characterId: 'c2', expressionId: 'f1' })
  })

  it('continues the line below when inserting at the top', () => {
    const result = insertLine(lines, characters, 'n', 0)
    expect(ids(result)).toBe('nab')
    expect(result[0]).toMatchObject({ characterId: 'c2', expressionId: 'f1' })
  })

  it('clamps an index outside the list', () => {
    expect(ids(insertLine(lines, characters, 'n', 9))).toBe('abn')
    expect(ids(insertLine(lines, characters, 'n', -1))).toBe('nab')
  })
})

describe('duplicateLine', () => {
  it('copies the whole line right below with a new id', () => {
    const tuned = line('a', {
      voice: { styleId: 3, speakerName: 'ずんだもん', styleName: 'ノーマル' },
      speedScale: 1.4,
    })
    const result = duplicateLine([tuned, line('b')], 'a', 'n')
    expect(ids(result)).toBe('anb')
    expect(result[1]).toEqual({ ...tuned, id: 'n' })
  })

  it('returns the same list for an unknown line', () => {
    const lines = [line('a')]
    expect(duplicateLine(lines, 'x', 'n')).toBe(lines)
  })
})

describe('moveLine', () => {
  const lines = [line('a'), line('b'), line('c'), line('d')]

  it('moves a line down to a gap below it', () => {
    expect(ids(moveLine(lines, 'a', 3))).toBe('bcad')
    expect(ids(moveLine(lines, 'a', 4))).toBe('bcda')
  })

  it('moves a line up to a gap above it', () => {
    expect(ids(moveLine(lines, 'd', 0))).toBe('dabc')
    expect(ids(moveLine(lines, 'c', 1))).toBe('acbd')
  })

  it('returns the same list when the gap is right above or below the line', () => {
    expect(moveLine(lines, 'b', 1)).toBe(lines)
    expect(moveLine(lines, 'b', 2)).toBe(lines)
    expect(moveLine(lines, 'x', 0)).toBe(lines)
  })
})

describe('removeLine and neighborAfterRemoval', () => {
  const lines = [line('a'), line('b'), line('c')]

  it('removes the line', () => {
    expect(ids(removeLine(lines, 'b'))).toBe('ac')
    expect(removeLine(lines, 'x')).toBe(lines)
  })

  it('opens the line below, or above for the last line, or nothing', () => {
    expect(neighborAfterRemoval(lines, 'b')).toBe('c')
    expect(neighborAfterRemoval(lines, 'c')).toBe('b')
    expect(neighborAfterRemoval([line('a')], 'a')).toBeNull()
  })
})
