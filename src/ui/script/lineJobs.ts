import type { Character, Expression, ExportSettings, ScriptLine, Vowel } from '../../core/character/types'
import { placement } from '../../core/export/frames'
import type { MouthFrames } from '../../core/export/frames'
import { lineProblem } from '../../core/storage/db'
import type { LineProblem } from '../../core/storage/db'

export const PROBLEM_LABELS: Record<LineProblem, string> = {
  'no-character': 'キャラが選ばれていないか、削除されています',
  'no-expression': '表情が選ばれていないか、削除されています',
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

/** 合成できる行ならキャラと表情を、できなければ理由を投げる。listenOnly なら口の未設定は許す。 */
export function resolveLine(line: ScriptLine, characters: Character[], listenOnly = false): ReadyLine {
  const problem = lineProblem(line, characters)
  if (problem && !(listenOnly && canListen(problem))) throw new Error(PROBLEM_LABELS[problem])
  const character = characters.find((c) => c.id === line.characterId)!
  const expression = character.expressions.find((e) => e.id === line.expressionId)!
  return { character: character as ReadyLine['character'], expression }
}

/** 書き出しと同じ配置で1フレームを描く（プレビュー用）。 */
export function drawMouthFrame(
  ctx: CanvasRenderingContext2D,
  frames: MouthFrames,
  vowel: Vowel,
  psdSize: { width: number; height: number },
  settings: ExportSettings,
): void {
  const bitmap = frames.get(vowel)
  ctx.fillStyle = settings.background
  ctx.fillRect(0, 0, settings.width, settings.height)
  if (!bitmap) return
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
