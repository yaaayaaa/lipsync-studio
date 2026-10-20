import type { ScriptLine } from '../../core/character/types'
import { isTuningStale } from '../../core/voicevox/tuning'

// 文を変えると作り込み（tuning）は合わなくなる。ただし1文字打つたびに捨てると、
// 打ち間違い1つで作り込みが消えるので、捨てるかどうかは文の確定（フォーカスを外す）で決める。

/** 打つたびの変更。作り込みは確定まで残す */
export function applyTextChange(line: ScriptLine, text: string): ScriptLine {
  return { ...line, text }
}

/**
 * 作り込みが今の文と合っていない（文を打ち替えて、まだ確定していない）か。
 * 文の確定で true なら、捨ててよいか確認が要る（OK なら dropTuning、取りやめたら restoreTunedText）
 */
export function hasStaleTuning(line: ScriptLine): boolean {
  return line.tuning !== undefined && isTuningStale(line.tuning, line.text)
}

/** 文を作り込みを作ったときの文に戻す（作り込みは残る）。作り込みがなければ・合っていればそのまま */
export function restoreTunedText(line: ScriptLine): ScriptLine {
  return line.tuning && line.text !== line.tuning.text ? applyTextChange(line, line.tuning.text) : line
}

/** 作り込みだけを捨てる。話速は行の値なので残る */
export function dropTuning(line: ScriptLine): ScriptLine {
  const { tuning: _dropped, ...rest } = line
  return rest
}
