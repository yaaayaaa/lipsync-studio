import type { ShortcutKey } from './history'

/**
 * 動画編集ソフトと同じく、Space だけ（修飾キーなし）で再生と停止を切り替える。
 * 押しっぱなしの繰り返しは無視する（再生と停止が交互に連打されないように）。
 */
export function isPlayShortcut(e: ShortcutKey & { repeat: boolean }): boolean {
  return e.key === ' ' && !e.repeat && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
}

/** 開いたドロップダウン・メニュー・確認の窓の中では、Space はそこでの選択に使う */
const SPACE_OWNERS = '[role="listbox"], [role="menu"], [role="dialog"], [role="option"]'

/** Space を再生に使わず、その要素に任せるところ。文字を打つ欄（isTextEntry）は呼び出し側で別に見る */
export function ownsSpace(el: Pick<Element, 'closest'> | null): boolean {
  return el?.closest(SPACE_OWNERS) != null
}
