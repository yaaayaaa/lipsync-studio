import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { placePopover } from './dropdownState'
import { MenuList } from './character/RowMenu'
import type { RowMenuItem } from './character/RowMenu'
import { menuReduce } from './character/menu'
import type { MenuEvent } from './character/menu'

const MENU_MIN_WIDTH = 180

export interface ContextMenuAt {
  x: number
  y: number
  /** ボタンから開くときは、ボタンの大きさ。その下（入らなければ上）に出す。なければ x, y の点から出す */
  width?: number
  height?: number
}

interface Props {
  /** 開く位置（右クリックした所）。null なら閉じている */
  at: ContextMenuAt | null
  /** メニューの読み上げ名（例「1行目の操作」） */
  label: string
  items: RowMenuItem[]
  /** ボタンから開いたときのボタン。そのボタンを押したときは外側として閉じない（ボタン自身が開け閉めする） */
  anchor?: HTMLElement | null
  /** 閉じたとき（項目を選んだときも、選ぶ前に呼ぶ）。開いた元へフォーカスを戻すのは呼んだ側 */
  onClose(): void
}

/**
 * 右クリックで出すメニュー（ボタンから開くメニューにも使う）。見た目とキー操作は行の「…」メニューと同じで、
 * 押した所かボタンの下に出す。
 * 画面の一番外側に置き、外を押す・Esc・スクロールで閉じる
 */
export function ContextMenu({ at, ...rest }: Props) {
  // 開くたびに作り直して、強調中の項目や位置を前の開き方から持ち越さない
  return at && <OpenContextMenu key={`${at.x},${at.y},${at.width},${at.height}`} at={at} {...rest} />
}

function OpenContextMenu({ at, label, items, anchor, onClose }: Props & { at: ContextMenuAt }) {
  const id = useId()
  const menuRef = useRef<HTMLUListElement>(null)
  const [state, setState] = useState(
    () => menuReduce({ open: false, active: 0 }, { type: 'toggle', count: items.length }, disabledOf(items)).state,
  )
  const [position, setPosition] = useState<CSSProperties | null>(null)

  // 閉じる処理は効果からも呼ぶ。毎回変わる関数で効果をやり直さないよう最新を参照で持つ
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  const dispatch = (event: MenuEvent) => {
    const result = menuReduce(state, event, disabledOf(items))
    setState(result.state)
    if (!result.state.open) onClose()
    if (result.activate !== undefined) items[result.activate]?.onSelect()
    return result
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (dispatch({ type: 'key', key: e.key, count: items.length }).handled) e.preventDefault()
  }

  // 押した所の右下に置き、入らなければ上や左へずらす。スクロールや大きさの変更で、押した所から離れたら閉じる
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const placement = placePopover(
      { x: at.x, y: at.y, width: at.width ?? 0, height: at.height ?? 0 },
      { width: window.innerWidth, height: window.innerHeight },
      menu.scrollHeight,
      // 置く前（幅を決めていないとき）の幅は中身の幅。項目の名前が切れないよう、それより狭くしない
      { minWidth: Math.max(MENU_MIN_WIDTH, Math.ceil(menu.getBoundingClientRect().width)), gap: at.height ? 4 : 0 },
    )
    if (!placement) onCloseRef.current()
    else setPosition(placement)
    const close = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) onCloseRef.current()
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [at])

  // フォーカス中の項目へ実際にフォーカスを移す
  const activeItemId = `${id}-item-${state.active}`
  useEffect(() => {
    document.getElementById(activeItemId)?.focus({ preventScroll: true })
  }, [activeItemId])

  // 外側を押したら閉じる（別の行を右クリックしたときも、いったん閉じてから開き直す）
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !anchor?.contains(t)) onCloseRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [anchor])

  return createPortal(
    <MenuList
      ref={menuRef}
      id={id}
      label={label}
      items={items}
      active={state.active}
      className="context-menu"
      // 置き場所が決まるまでは透明にしておく（visibility: hidden だとフォーカスを受け取れない）
      style={{ position: 'fixed', ...(position ?? { opacity: 0, pointerEvents: 'none', top: 0, left: 0 }) }}
      onKeyDown={onKeyDown}
      dispatch={dispatch}
    />,
    document.body,
  )
}

const disabledOf = (items: RowMenuItem[]) => items.map((i) => i.disabled === true)
