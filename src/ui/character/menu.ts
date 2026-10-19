/**
 * 行の「…」メニュー（role=menu）の開閉とキーボード操作。項目は番号で表す。
 * 選択肢の一覧（dropdown.ts）と違い「選択中」はなく、上下は端で回り込む。
 * 無効な項目（disabled）は移動で飛ばし、押しても実行しない（開いたまま）。
 */
export interface MenuState {
  open: boolean
  /** フォーカス中の項目 */
  active: number
}

export type MenuEvent =
  /** メニューボタンのクリック */
  | { type: 'toggle'; count?: number }
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

export function menuReduce(state: MenuState, event: MenuEvent, disabled: readonly boolean[] = []): MenuResult {
  const closed = { open: false, active: state.active }
  // 項目番号は disabled が短い（または欠落）ぶん安全に扱う: undefined は「有効」
  const usable = (i: number, count: number) => ((i % count) + count) % count
  /** from から dir 方向に調べて最初の有効な項目へ。全部無効なら from のまま */
  const nearest = (from: number, dir: 1 | -1, count: number): number => {
    if (count <= 0) return from
    for (let n = 0; n < count; n++) {
      const i = usable(from + dir * n, count)
      if (!disabled[i]) return i
    }
    return state.active
  }
  const enabled = (index: number) => !disabled[index]

  switch (event.type) {
    case 'toggle':
      return state.open
        ? { state: closed, focusButton: true, handled: true }
        : { state: { open: true, active: nearest(0, 1, event.count ?? 1) }, handled: true }
    case 'close':
      return { state: closed, handled: true }
    case 'hover':
      // 無効な項目へは移動しない（マウスでなぞっても前の項目が強調されたまま）
      if (!state.open) return { state, handled: false }
      return enabled(event.index)
        ? { state: { open: true, active: event.index }, handled: true }
        : { state, handled: true }
    case 'click':
      if (!enabled(event.index)) return { state: { open: true, active: state.active }, handled: true }
      return { state: { open: false, active: event.index }, activate: event.index, focusButton: true, handled: true }
    case 'key': {
      const { key, count } = event
      if (!state.open) {
        if (key === 'Enter' || key === ' ' || key === 'ArrowDown')
          return { state: { open: true, active: nearest(0, 1, count) }, handled: true }
        if (key === 'ArrowUp') return { state: { open: true, active: nearest(count - 1, -1, count) }, handled: true }
        return { state, handled: false }
      }
      const move = (to: number, dir: 1 | -1 = 1): MenuResult => ({
        state: { open: true, active: nearest(to, dir, count) },
        handled: true,
      })
      switch (key) {
        case 'ArrowDown':
          return move(state.active + 1, 1)
        case 'ArrowUp':
          return move(state.active - 1, -1)
        case 'Home':
          return move(0, 1)
        case 'End':
          return move(count - 1, -1)
        case 'Enter':
        case ' ':
          // 無効な項目では閉じずにそのまま（押せないことが押せない操作にも出ない）
          if (!enabled(state.active)) return { state: { open: true, active: state.active }, handled: true }
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
