import type { ScriptLine } from '../../core/character/types'
import { isTuningStale } from '../../core/voicevox/tuning'

// 文を変えると作り込み（tuning）は合わなくなる。ただし1文字打つたびに捨てると、
// 打ち間違い1つで作り込みが消えるので、捨てるかどうかは文の確定（フォーカスを外す・Enter）で決める。

/** 打つたびの変更。作り込みは確定まで残す */
export function applyTextChange(line: ScriptLine, text: string): ScriptLine {
  return { ...line, text }
}

/** 文の確定。作り込みが今の文と合わなければ、捨ててよいか確認が要る（OK なら dropTuning） */
export function commitText(line: ScriptLine): { line: ScriptLine; needsConfirm: boolean } {
  return { line, needsConfirm: line.tuning !== undefined && isTuningStale(line.tuning, line.text) }
}

/** 作り込みだけを捨てる。話速は行の値なので残る */
export function dropTuning(line: ScriptLine): ScriptLine {
  const { tuning: _dropped, ...rest } = line
  return rest
}
