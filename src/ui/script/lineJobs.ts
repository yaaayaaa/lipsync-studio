import type { Character, Expression, ExportSettings, LineTuning, ScriptLine } from '../../core/character/types'
import { placement } from '../../core/export/frames'
import type { FrameKey, FrameStore } from '../../core/export/frames'
import { lineProblem } from '../../core/storage/db'
import type { LineProblem } from '../../core/storage/db'

export const PROBLEM_LABELS: Record<LineProblem, string> = {
  'no-character': 'キャラが選ばれていないか、削除されています',
  'no-expression': 'スタイルが選ばれていないか、削除されています',
  'no-voice': 'このキャラには声が設定されていません（キャラ設定で選んでください）',
  'no-mouth': 'キャラ設定で口グループと口の割り当てをしてください',
  'empty-text': 'セリフが空です',
}

export interface ReadyLine {
  character: Character & { voice: NonNullable<Character['voice']> }
  expression: Expression
}

/** 声があれば鳴らせる。口が未設定でも試聴はできる（プレビューと書き出しは不可）。 */
export function canListen(problem: LineProblem | null): boolean {
  return problem === null || problem === 'no-mouth'
}

/** 合成できる行ならキャラとスタイルを、できなければ理由を投げる。listenOnly なら口の未設定は許す。 */
export function resolveLine(line: ScriptLine, characters: Character[], listenOnly = false): ReadyLine {
  const problem = lineProblem(line, characters)
  if (problem && !(listenOnly && canListen(problem))) throw new Error(PROBLEM_LABELS[problem])
  const character = characters.find((c) => c.id === line.characterId)!
  const expression = character.expressions.find((e) => e.id === line.expressionId)!
  return { character: character as ReadyLine['character'], expression }
}

/**
 * 声が変わって取り直した作り込みを、その行へ書き戻す（speakLine が tuning を返したとき）。
 * 合成を待つ間に作り込みが変わった（文の変更で捨てられた・1行編集で動かした）なら、取り直した値は捨てる。
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

/**
 * 末尾に空の行を足す。キャラとスタイルは最後の行を引き継ぎ（なければ最初のキャラ）、話速は既定の 1.0
 */
export function appendLine(lines: ScriptLine[], characters: Character[], id: string): ScriptLine[] {
  const last = lines.at(-1)
  const character = characters.find((c) => c.id === last?.characterId) ?? characters[0]
  const expressionId =
    last && character?.id === last.characterId ? last.expressionId : (character?.expressions[0]?.id ?? null)
  return [...lines, { id, text: '', characterId: character?.id ?? null, expressionId, speedScale: 1.0 }]
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
