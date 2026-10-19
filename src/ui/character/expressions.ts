import type { Expression } from '../../core/character/types'
import { applyFavorite, parsePfv } from '../../core/psd/pfv'
import type { LayerNode } from '../../core/psd/types'

/** 「スタイルN」のうち、まだ使われていない最小の N（件数+1 から探す）。 */
export function nextExpressionName(expressions: Expression[]): string {
  const used = new Set(expressions.map((e) => e.name))
  let n = expressions.length + 1
  while (used.has(`スタイル${n}`)) n++
  return `スタイル${n}`
}

export interface PfvImport {
  expressions: Expression[]
  missingPaths: number
}

/** .pfv の各お気に入りを、その名前のスタイルにする。PfvFormatError を投げうる。 */
export function importPfv(tree: LayerNode[], text: string, newId: () => string): PfvImport {
  let missingPaths = 0
  const expressions = parsePfv(text).map((fav) => {
    const applied = applyFavorite(tree, fav)
    missingPaths += applied.missingPaths
    return { id: newId(), name: fav.name, visibility: applied.visibility }
  })
  return { expressions, missingPaths }
}

export function pfvImportMessage(result: PfvImport): string {
  const n = result.expressions.length
  return result.missingPaths > 0
    ? `${n}件取り込み、${result.missingPaths}件のレイヤーが見つかりませんでした`
    : `${n}件取り込みました`
}
