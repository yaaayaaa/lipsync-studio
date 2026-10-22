import type { Character, ScriptLine } from '../../core/character/types'

// 台本の一覧の行の追加・複製・並べ替え・削除。どれも新しい配列を返し、渡した配列は変えない。

/**
 * index の位置に空の行を足す。キャラとスタイルは上の行（先頭なら下の行）を引き継ぎ、
 * 引き継げなければ最初のキャラ。話速は既定の 1.0
 */
export function insertLine(lines: ScriptLine[], characters: Character[], id: string, index: number): ScriptLine[] {
  const at = Math.max(0, Math.min(index, lines.length))
  const neighbor = lines[at - 1] ?? lines[at]
  const character = characters.find((c) => c.id === neighbor?.characterId) ?? characters[0]
  const expressionId =
    neighbor && character?.id === neighbor.characterId ? neighbor.expressionId : (character?.expressions[0]?.id ?? null)
  const line: ScriptLine = { id, text: '', characterId: character?.id ?? null, expressionId, speedScale: 1.0 }
  return [...lines.slice(0, at), line, ...lines.slice(at)]
}

/** 末尾に空の行を足す（insertLine の末尾版） */
export function appendLine(lines: ScriptLine[], characters: Character[], id: string): ScriptLine[] {
  return insertLine(lines, characters, id, lines.length)
}

/** 行をすぐ下に複製する。文・声・作り込みもそのまま写す（id だけ新しくする） */
export function duplicateLine(lines: ScriptLine[], lineId: string, id: string): ScriptLine[] {
  const index = lines.findIndex((l) => l.id === lineId)
  if (index < 0) return lines
  return [...lines.slice(0, index + 1), { ...lines[index], id }, ...lines.slice(index + 1)]
}

/**
 * 行を gap の位置へ移す。gap は行の間の番号（0 が先頭の上、lines.length が末尾の下）で、
 * ドラッグで線を引いた位置をそのまま渡せる。動かないときは同じ配列を返す
 */
export function moveLine(lines: ScriptLine[], lineId: string, gap: number): ScriptLine[] {
  const from = lines.findIndex((l) => l.id === lineId)
  if (from < 0) return lines
  const to = Math.max(0, Math.min(gap, lines.length))
  // 自分のすぐ上とすぐ下の境目は、今の位置と同じ
  if (to === from || to === from + 1) return lines
  const rest = lines.filter((_, i) => i !== from)
  const at = to > from ? to - 1 : to
  return [...rest.slice(0, at), lines[from], ...rest.slice(at)]
}

/** 行を消す。ないときは同じ配列を返す */
export function removeLine(lines: ScriptLine[], lineId: string): ScriptLine[] {
  return lines.some((l) => l.id === lineId) ? lines.filter((l) => l.id !== lineId) : lines
}

/** 消した行の代わりに開く行。下の行、なければ上の行。行が残らなければ null */
export function neighborAfterRemoval(lines: ScriptLine[], lineId: string): string | null {
  const index = lines.findIndex((l) => l.id === lineId)
  if (index < 0) return null
  return (lines[index + 1] ?? lines[index - 1])?.id ?? null
}
