import { describe, expect, it } from 'vitest'
import type { Character, ScriptLine } from '../../../src/core/character/types'
import { bulkSummary, lineNumbers, planBulkExport } from '../../../src/ui/lineEditor/bulkExportPlan'

const character: Character = {
  id: 'c1',
  name: 'ずんだもん',
  psdFileName: 'z.psd',
  voice: { styleId: 3, speakerName: 'ずんだもん', styleName: 'ノーマル' },
  mouthGroupId: 'g',
  mouthMap: { a: 'm1', i: 'm1', u: 'm1', e: 'm1', o: 'm1', closed: 'm2' },
  expressions: [{ id: 'e1', name: 'e1', visibility: {} }],
}
const line = (id: string, more: Partial<ScriptLine> = {}): ScriptLine => ({
  id,
  text: id,
  characterId: 'c1',
  expressionId: 'e1',
  speedScale: 1,
  ...more,
})

describe('planBulkExport', () => {
  it('keeps exportable lines in script order with their positions and skips the rest', () => {
    const lines = [line('a'), line('b', { text: ' ' }), line('c'), line('d', { characterId: 'gone' })]
    const plan = planBulkExport(lines, [character])
    expect(plan.targets.map((t) => [t.line.id, t.index])).toEqual([
      ['a', 0],
      ['c', 2],
    ])
    expect(plan.skipped).toEqual([
      { index: 1, problem: 'empty-text' },
      { index: 3, problem: 'no-character' },
    ])
  })
})

describe('bulkSummary', () => {
  it('names the file and the number of lines', () => {
    expect(bulkSummary('joined', 3, [])).toBe('書き出しました：zunda-lipsync.mp4（3行）')
  })

  it('lists skipped lines by number and failed lines with their reasons', () => {
    expect(lineNumbers([1, 3])).toBe('2・4行目')
    expect(bulkSummary('zip', 2, [1, 3], [{ index: 4, error: 'つながりません' }])).toBe(
      '書き出しました：zunda-lipsync.zip（2行）。2・4行目は、キャラ・声・口・文のどれかが足りないので飛ばしました。5行目は書き出せませんでした：つながりません',
    )
  })

  it('says nothing was written when every line failed', () => {
    expect(bulkSummary('zip', 0, [], [{ index: 0, error: 'x' }])).toBe(
      '1行も書き出せませんでした。1行目は書き出せませんでした：x',
    )
  })
})
