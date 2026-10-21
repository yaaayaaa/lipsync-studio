// 1行編集のキャラ・スタイルの選択欄の絞り込み。キャラ名とスタイル名をまとめて探す。
// 打ちやすさのため、ひらがな・カタカナ、全角・半角、大文字・小文字を区別しない。

interface Named {
  id: string
  name: string
}

export interface StyleGroup<C> {
  character: C
  expressions: Named[]
}

/** 比べやすい形にそろえる（NFKC で全角英数・半角カナをそろえ、カタカナをひらがなに、小文字に） */
function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase()
}

/**
 * 空白で区切った語がすべて「キャラ名 スタイル名」のどこかに含まれるスタイルを、キャラごとにまとめて返す。
 * スタイルのないキャラは選べないので出さない。並びは元のまま
 */
export function searchStyles<C extends Named & { expressions: Named[] }>(
  characters: readonly C[],
  query: string,
): StyleGroup<C>[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return characters
    .map((character) => ({
      character,
      expressions: character.expressions.filter((e) => {
        const target = normalize(`${character.name} ${e.name}`)
        return words.every((w) => target.includes(w))
      }),
    }))
    .filter((g) => g.expressions.length > 0)
}
