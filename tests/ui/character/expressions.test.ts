import { describe, expect, it } from 'vitest'
import { buildLayerTree } from '../../../src/core/psd/layerTree'
import { PfvFormatError } from '../../../src/core/psd/pfv'
import { importPfv, nextExpressionName, pfvImportMessage } from '../../../src/ui/character/expressions'
import { layer } from '../../fixtures/makePsd'

const expr = (name: string) => ({ id: name, name, visibility: {} })

describe('nextExpressionName', () => {
  it('starts at スタイル1', () => {
    expect(nextExpressionName([])).toBe('スタイル1')
  })

  it('uses count+1 and skips names already taken', () => {
    expect(nextExpressionName([expr('笑顔')])).toBe('スタイル2')
    expect(nextExpressionName([expr('スタイル2'), expr('スタイル3')])).toBe('スタイル4')
  })
})

describe('importPfv', () => {
  const tree = buildLayerTree([
    layer('!体'),
    layer('目', { children: [layer('*普通'), layer('*にっこり')] }),
  ])
  let n = 0
  const newId = () => `id${++n}`

  it('turns each favorite into an expression and counts missing layers', () => {
    const text = '[PSDToolFavorites-v1]\n//お気に入り/笑顔\n目\n目/*にっこり\n//お気に入り/謎\n目/*存在しない\n無い\n'
    const result = importPfv(tree, text, newId)
    expect(result.expressions.map((e) => e.name)).toEqual(['笑顔', '謎'])
    expect(new Set(result.expressions.map((e) => e.id)).size).toBe(2)
    // 目 = "1", にっこり = "1/1"
    expect(result.expressions[0].visibility['1/1']).toBe(true)
    expect(result.expressions[0].visibility['0']).toBe(true)
    expect(result.missingPaths).toBe(2)
    expect(pfvImportMessage(result)).toBe('2件取り込み、2件のレイヤーが見つかりませんでした')
  })

  it('reports a plain count when nothing is missing', () => {
    const result = importPfv(tree, '[PSDToolFavorites-v1]\n//f/a\n目\n', newId)
    expect(pfvImportMessage(result)).toBe('1件取り込みました')
  })

  it('rejects files that are not .pfv', () => {
    expect(() => importPfv(tree, 'hello', newId)).toThrow(PfvFormatError)
  })
})
