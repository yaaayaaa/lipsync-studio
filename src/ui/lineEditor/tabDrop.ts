// タブをタブの帯に重ねたときの「入る位置」。dockview は線を重ねている先のタブの内側に描くため、
// 同じ境目でも「前のタブの後ろ」と「次のタブの前」で線の位置が分かれる。入る位置を境目の番号に直して、
// 線は自前で境目の真上に1本だけ引く。

/** 入る位置。束のタブの間の境目の番号（0 は先頭の前、tabs.length は最後の後ろ） */
export type DropGap = number

interface TabSpan {
  left: number
  right: number
}

/**
 * ポインタの横位置で決まる入る位置：真ん中がポインタより左にあるタブの数（タブの左半分なら前、右半分なら後ろ）。
 * 重ねている先のタブを別に調べて左右と組み合わせると、境目のちょうど上で両者が食い違い、線が消える・飛ぶことがあるので、
 * 位置だけから1つに決める
 */
export function dropGapAtX(tabs: readonly TabSpan[], x: number): DropGap {
  return tabs.filter((t) => (t.left + t.right) / 2 <= x).length
}

/** 離しても並びが変わらないか（同じ束のタブを、自分のすぐ前かすぐ後ろの境目に入れる） */
export function isNoOpDrop(tabs: readonly string[], dragged: string, gap: DropGap): boolean {
  const from = tabs.indexOf(dragged)
  return from >= 0 && (gap === from || gap === from + 1)
}

/** 境目の横位置。境目の右のタブの左端、最後の後ろなら最後のタブの右端 */
export function gapX(tabs: readonly TabSpan[], gap: DropGap): number | null {
  const next = tabs[gap]
  if (next) return next.left
  const last = tabs[gap - 1]
  return last && gap === tabs.length ? last.right : null
}
