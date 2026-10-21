import type { ScriptLine } from '../../core/character/types'

// 作り込み（tuning）は作ったときの文のモーラごとの値なので、文が変わると合わなくなる。
// 確認は出さず、文を変えたその場で捨てる（1行編集では取り消しで文ごと戻せる）。

/** 文を変える。作り込みを作ったときの文と違えば、作り込みを捨てる */
export function applyTextChange(line: ScriptLine, text: string): ScriptLine {
  if (line.tuning && line.tuning.text !== text) return { ...dropTuning(line), text }
  return { ...line, text }
}

/** 作り込みだけを捨てる。話速は行の値なので残る */
export function dropTuning(line: ScriptLine): ScriptLine {
  const { tuning: _dropped, ...rest } = line
  return rest
}

/** 今の文で使える作り込みがあるか（文を変えると捨てるが、それ以前に保存した行には古い作り込みが残っていることがある） */
export function isTuned(line: ScriptLine): boolean {
  return line.tuning !== undefined && line.tuning.text === line.text
}
