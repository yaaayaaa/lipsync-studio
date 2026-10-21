// 畳める選択欄（GroupPicker）の絞り込み。見出し（キャラ・話者）の名前と項目（スタイル）の名前をまとめて探す。
// 打ちやすさのため、ひらがな・カタカナ、全角・半角、大文字・小文字を区別しない。

export interface PickerItem {
  id: string
  name: string
}

export interface PickerGroup {
  id: string
  name: string
  items: PickerItem[]
}

/** 比べやすい形にそろえる（NFKC で全角英数・半角カナをそろえ、カタカナをひらがなに、小文字に） */
function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase()
}

/**
 * 空白で区切った語がすべて「見出しの名前 項目の名前」のどこかに含まれる項目を、見出しごとにまとめて返す。
 * 項目のない見出しは選べないので出さない。並びは元のまま
 */
export function searchGroups(groups: readonly PickerGroup[], query: string): PickerGroup[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const target = normalize(`${group.name} ${item.name}`)
        return words.every((w) => target.includes(w))
      }),
    }))
    .filter((g) => g.items.length > 0)
}
