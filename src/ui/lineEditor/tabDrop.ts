// タブを同じ束のタブに重ねたとき、離しても並びが変わらないか。変わらないなら入る位置の線を出さない
// （今いる場所に線が出ると、何かが起きそうに見えるため）。

export interface SameGroupTabDrop {
  /** 束のタブの並び（パネル ID） */
  tabs: readonly string[]
  /** ドラッグしているタブ */
  dragged: string
  /** 重ねている先のタブ */
  over: string
  /** 重ねている先のタブの左半分なら前、右半分なら後ろに入る */
  side: 'left' | 'right'
}

export function isNoOpTabDrop({ tabs, dragged, over, side }: SameGroupTabDrop): boolean {
  const from = tabs.indexOf(dragged)
  const at = tabs.indexOf(over)
  if (from < 0 || at < 0) return false
  // 入る位置（今の並びでの隙間の番号）。自分のすぐ前か、すぐ後ろの隙間なら元の場所のまま
  const gap = side === 'left' ? at : at + 1
  return gap === from || gap === from + 1
}
