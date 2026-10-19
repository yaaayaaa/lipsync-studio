/**
 * 行の「…」メニュー（role=menu）の開閉とキーボード操作。項目は番号で表す。
 * 選択肢の一覧（dropdown.ts）と違い「選択中」はなく、上下は端で反対側へ回り込む。
 */
export interface MenuState {
  open: boolean
  /** フォーカス中の項目 */
  active: number
}

export type MenuEvent =
  /** メニューボタンのクリック */
  | { type: 'toggle' }
  /** 外側のクリックなど。フォーカスは動かさない */
  | { type: 'close' }
  | { type: 'hover'; index: number }
  | { type: 'click'; index: number }
  | { type: 'key'; key: string; count: number }

export interface MenuResult {
  state: MenuState
  /** 実行する項目 */
  activate?: number
  /** メニューボタンにフォーカスを戻す（項目の実行より先に戻す） */
  focusButton?: boolean
  /** true ならブラウザの既定動作を止める */
  handled: boolean
}

export function menuReduce(state: MenuState, event: MenuEvent): MenuResult {
  const closed = { open: false, active: state.active }
  switch (event.type) {
    case 'toggle':
      return state.open
        ? { state: closed, focusButton: true, handled: true }
        : { state: { open: true, active: 0 }, handled: true }
    case 'close':
      return { state: closed, handled: true }
    case 'hover':
      return state.open ? { state: { open: true, active: event.index }, handled: true } : { state, handled: false }
    case 'click':
      return { state: { open: false, active: event.index }, activate: event.index, focusButton: true, handled: true }
    case 'key': {
      const { key, count } = event
      if (!state.open) {
        if (key === 'Enter' || key === ' ' || key === 'ArrowDown') return { state: { open: true, active: 0 }, handled: true }
        if (key === 'ArrowUp') return { state: { open: true, active: count - 1 }, handled: true }
        return { state, handled: false }
      }
      const move = (to: number): MenuResult => ({ state: { open: true, active: (to + count) % count }, handled: true })
      switch (key) {
        case 'ArrowDown':
          return move(state.active + 1)
        case 'ArrowUp':
          return move(state.active - 1)
        case 'Home':
          return move(0)
        case 'End':
          return move(count - 1)
        case 'Enter':
        case ' ':
          return { state: closed, activate: state.active, focusButton: true, handled: true }
        case 'Escape':
          return { state: closed, focusButton: true, handled: true }
        case 'Tab':
          // 閉じてボタンにフォーカスを戻し、そこから次（Shift なら前）の部品へ普通に進ませる
          return { state: closed, focusButton: true, handled: false }
        default:
          return { state, handled: false }
      }
    }
  }
}
