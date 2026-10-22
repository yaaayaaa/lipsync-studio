import type { Character, ScriptLine } from '../../core/character/types'
import { lineProblem } from '../../core/storage/db'
import type { LineProblem } from '../../core/storage/db'

/** まとめて書き出しの形。1本の mp4 につなぐか、行ごとの mp4 を zip にするか */
export type BulkMode = 'joined' | 'zip'

export const BULK_FILE_NAMES: Record<BulkMode, string> = {
  joined: 'lipsync-studio.mp4',
  zip: 'lipsync-studio.zip',
}

export interface BulkPlan {
  /** 書き出す行と、台本の中の位置（0 から） */
  targets: { line: ScriptLine; index: number }[]
  /** 書き出せないので飛ばす行 */
  skipped: { index: number; problem: LineProblem }[]
}

/** 書き出せる行（キャラ・スタイル・声・口がそろい、文がある行）だけを、台本の順に選ぶ */
export function planBulkExport(lines: ScriptLine[], characters: Character[]): BulkPlan {
  const plan: BulkPlan = { targets: [], skipped: [] }
  lines.forEach((line, index) => {
    const problem = lineProblem(line, characters)
    if (problem) plan.skipped.push({ index, problem })
    else plan.targets.push({ line, index })
  })
  return plan
}

/** 「2・4行目」のように、行の番号（1 から）を並べる */
export function lineNumbers(indexes: number[]): string {
  return `${indexes.map((i) => i + 1).join('・')}行目`
}

/**
 * 書き出しの結果の一言。書き出した行の数（0 ならそう言う）と、飛ばした行・失敗した行（zip のとき）を添える。
 * 失敗した行は理由も出す（理由は行ごとに違いうる）
 */
export function bulkSummary(
  mode: BulkMode,
  written: number,
  skipped: number[],
  failed: { index: number; error: string }[] = [],
): string {
  const parts = [written > 0 ? `書き出しました：${BULK_FILE_NAMES[mode]}（${written}行）` : '1行も書き出せませんでした']
  if (skipped.length > 0) parts.push(`${lineNumbers(skipped)}は、キャラ・声・口・文のどれかが足りないので飛ばしました`)
  for (const f of failed) parts.push(`${f.index + 1}行目は書き出せませんでした：${f.error}`)
  return parts.join('。')
}
