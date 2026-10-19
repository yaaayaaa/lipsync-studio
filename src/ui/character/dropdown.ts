/**
 * 画像付きのドロップダウン（listbox）の開閉と、キーボードで選ぶ位置の動き。
 * 位置は選択肢の並びの番号。DOM に触れない純粋な関数にして、画面と切り離して確かめられるようにする。
 */
export interface DropdownState {
  open: boolean
  /** 開いている間に強調している選択肢 */
  active: number
}

export type DropdownEvent =
  /** ボタンのクリック。selected は今選ばれている選択肢（なければ -1） */
  | { type: 'toggle'; selected: number }
  /** 外側のクリックなど。フォーカスは動かさない */
  | { type: 'close' }
  | { type: 'hover'; index: number }
  | { type: 'key'; key: string; selected: number; count: number }

export interface DropdownResult {
  state: DropdownState
  /** 確定した選択肢 */
  choose?: number
  /** ボタンにフォーカスを戻す */
  focusButton?: boolean
  /** true ならブラウザの既定動作（スクロールなど）を止める */
  handled: boolean
}

const OPEN_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', ' '])

function clamp(i: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i))
}

export function dropdownReduce(state: DropdownState, event: DropdownEvent): DropdownResult {
  const closed = { open: false, active: state.active }
  switch (event.type) {
    case 'toggle':
      return state.open
        ? { state: closed, handled: true }
        : { state: { open: true, active: Math.max(0, event.selected) }, handled: true }
    case 'close':
      return { state: closed, handled: true }
    case 'hover':
      return state.open ? { state: { open: true, active: event.index }, handled: true } : { state, handled: false }
    case 'key': {
      const { key, selected, count } = event
      if (!state.open) {
        return OPEN_KEYS.has(key)
          ? { state: { open: true, active: Math.max(0, selected) }, handled: true }
          : { state, handled: false }
      }
      const active = clamp(state.active, count)
      const move = (to: number): DropdownResult => ({ state: { open: true, active: clamp(to, count) }, handled: true })
      switch (key) {
        case 'ArrowDown':
          return move(active + 1)
        case 'ArrowUp':
          return move(active - 1)
        case 'Home':
          return move(0)
        case 'End':
          return move(count - 1)
        case 'Enter':
        case ' ':
          return { state: { open: false, active }, choose: active, focusButton: true, handled: true }
        case 'Escape':
          return { state: closed, focusButton: true, handled: true }
        case 'Tab':
          // 閉じるだけで、フォーカスは次の部品へ普通に進ませる
          return { state: closed, handled: false }
        default:
          return { state, handled: false }
      }
    }
  }
}
