/**
 * 自前のドロップダウン（listbox）の開閉と、キーボードで選ぶ位置の動き。
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
      // ボタンで閉じたらフォーカスをボタンに戻す（Safari はクリックでボタンにフォーカスしないため明示する）
      return state.open
        ? { state: closed, focusButton: true, handled: true }
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
          // 閉じてボタンにフォーカスを戻し、そこから次（Shift なら前）の部品へ普通に進ませる
          return { state: closed, focusButton: true, handled: false }
        default:
          return { state, handled: false }
      }
    }
  }
}

export interface PopoverPlacement {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

const POPOVER_MAX_HEIGHT = 280
const POPOVER_MIN_HEIGHT = 96
const POPOVER_MIN_WIDTH = 200
const SCREEN_MARGIN = 8

/**
 * 一覧を画面に固定して置く位置。ボタンの下に置き、下より上の方が広ければ上に出す。横は画面内に収める。
 * ボタンが画面の外へスクロールしたら null（閉じる）。高さは中でスクロールするので、狭くても最小値は保つ。
 */
export function placePopover(
  anchor: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  needed: number,
  /**
   * align: 'end' なら右端をボタンにそろえる（行の右端にあるメニューボタン向け）。gap はボタンとのすき間。
   * maxHeight は高さの上限（検索窓と畳める候補を持つ一覧は、候補が多いので高めにする）
   */
  {
    align = 'start',
    minWidth = POPOVER_MIN_WIDTH,
    gap = 2,
    maxHeight: limit = POPOVER_MAX_HEIGHT,
  }: { align?: 'start' | 'end'; minWidth?: number; gap?: number; maxHeight?: number } = {},
): PopoverPlacement | null {
  const bottomEdge = anchor.y + anchor.height
  const rightEdge = anchor.x + anchor.width
  if (bottomEdge <= 0 || anchor.y >= viewport.height || rightEdge <= 0 || anchor.x >= viewport.width) return null
  const below = viewport.height - bottomEdge - SCREEN_MARGIN
  const above = anchor.y - SCREEN_MARGIN
  const downward = below >= Math.min(needed, limit) || below >= above
  const maxHeight = Math.max(POPOVER_MIN_HEIGHT, Math.min(limit, downward ? below : above))
  const width = Math.max(anchor.width, minWidth)
  const preferred = align === 'end' ? rightEdge - width : anchor.x
  const left = Math.max(SCREEN_MARGIN, Math.min(preferred, viewport.width - width - SCREEN_MARGIN))
  return downward
    ? { left, width, top: bottomEdge + gap, maxHeight }
    : { left, width, bottom: viewport.height - anchor.y + gap, maxHeight }
}
