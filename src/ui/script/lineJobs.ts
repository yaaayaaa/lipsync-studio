import type { Character, Expression, ExportSettings, LineTuning, ScriptLine, VoiceRef } from '../../core/character/types'
import { lineVoice } from '../../core/character/voice'
import { placement } from '../../core/export/frames'
import type { FrameKey, FrameStore } from '../../core/export/frames'
import { lineProblem } from '../../core/storage/db'
import type { LineProblem } from '../../core/storage/db'

export const PROBLEM_LABELS: Record<LineProblem, string> = {
  'no-character': 'キャラが選ばれていないか、削除されています',
  'no-expression': 'スタイルが選ばれていないか、削除されています',
  'no-voice': '声が設定されていません（キャラ設定か台本の「その他」で選んでください）',
  'no-mouth': 'キャラ設定で口グループと口の割り当てをしてください',
  'empty-text': 'セリフが空です',
}

export interface ReadyLine {
  character: Character
  expression: Expression
  /** 行で使う声（行の声、なければキャラの声） */
  voice: VoiceRef
}

/** 合成できる行ならキャラ・スタイル・声を、できなければ理由を投げる */
export function resolveLine(line: ScriptLine, characters: Character[]): ReadyLine {
  const problem = lineProblem(line, characters)
  if (problem) throw new Error(PROBLEM_LABELS[problem])
  const character = characters.find((c) => c.id === line.characterId)!
  const expression = character.expressions.find((e) => e.id === line.expressionId)!
  return { character, expression, voice: lineVoice(line, character)! }
}

/**
 * 声が変わって取り直した作り込みを、その行へ書き戻す（speakLine が tuning を返したとき）。
 * 合成を待つ間に作り込みが変わった（文の変更で捨てられた・台本で動かした）なら、取り直した値は捨てる。
 * 行は書き換えのたびに作り直されるので、合成に使った作り込みと同じオブジェクトのままかで判断する。
 */
export function saveRefreshedTuning(
  lines: ScriptLine[],
  lineId: string,
  used: LineTuning,
  refreshed: LineTuning,
): ScriptLine[] {
  const current = lines.find((l) => l.id === lineId)
  if (!current || current.tuning !== used) return lines
  return lines.map((l) => (l === current ? { ...l, tuning: refreshed } : l))
}

/** 書き出しと同じ配置で1フレームを描く（プレビュー用）。まだ合成していない組み合わせは背景だけ。 */
export function drawMouthFrame(
  ctx: CanvasRenderingContext2D,
  frames: FrameStore,
  key: FrameKey,
  psdSize: { width: number; height: number },
  settings: ExportSettings,
): void {
  ctx.fillStyle = settings.background
  ctx.fillRect(0, 0, settings.width, settings.height)
  if (!frames.has(key)) return
  const bitmap = frames.get(key)
  const rect = placement(settings, psdSize)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height)
}

/** Blob をファイルとして保存させる。URL はダウンロードが始まってから解放する。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}
