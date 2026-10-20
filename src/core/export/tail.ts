import type { ExportSettings, ScriptLine } from '../character/types'

/** 終端の長さ（秒）のつまみの範囲 */
export const TAIL_RANGE = { min: 0, max: 10, step: 0.1 } as const

/** 範囲に収め、0.1 秒刻みに丸める。数でない値は 0 */
export function clampTail(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0
  const clamped = Math.min(TAIL_RANGE.max, Math.max(TAIL_RANGE.min, seconds))
  return Math.round(clamped / TAIL_RANGE.step) / (1 / TAIL_RANGE.step)
}

/** その行の終端の長さ。行の値があればそれ（0 も含む）、なければ書き出し設定の既定 */
export function effectiveTail(
  line: Pick<ScriptLine, 'tailSeconds'>,
  settings: Pick<ExportSettings, 'tailSeconds'>,
): number {
  return clampTail(line.tailSeconds ?? settings.tailSeconds)
}
