import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { iconProps } from '../icons'
import type { CSSProperties, KeyboardEvent } from 'react'
import { placePopover } from './dropdown'
import { menuReduce } from './menu'
import type { MenuEvent } from './menu'

export interface RowMenuItem {
  label: string
  /** 項目の頭に付けるアイコン */
  icon?: LucideIcon
  /** 削除などの取り返しのつかない操作。区切り線の後に赤で出す */
  danger?: boolean
  /** いまは押せない項目。薄く表示し、キーボードの移動対象からも外す */
  disabled?: boolean
  /** 無効な理由などの補足。マウスを乗せたときとキーボード操作時に読み上げる */
  hint?: string
  onSelect(): void
}

interface Props {
  /** ボタンの読み上げ名（例「キャラの操作」） */
  label: string
  items: RowMenuItem[]
}

const MENU_MIN_WIDTH = 180
/** ボタンとメニューのすき間 */
const MENU_GAP = 4

/**
 * 一覧の行の「…」メニュー。項目へは実際にフォーカスを移す（role=menu の作法）。
 * 一覧の列の枠で切れないよう画面に固定して置き、右端をボタンにそろえる。
 */
export function RowMenu({ label, items }: Props) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const [state, setState] = useState({ open: false, active: 0 })
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const { open, active } = state
  const disabled = items.map((i) => i.disabled === true)
  /** 無効な項目の説明を、押せないことをはっきり伝えるため先に付ける */
  const labelFor = (item: RowMenuItem) => (item.disabled && item.hint ? `${item.hint}（${item.label}）` : (item.hint ?? item.label))
  // Safari はボタンをクリックしてもフォーカスしないので、押した瞬間にフォーカスが外れたように見える。
  // その間はフォーカス離脱で閉じない（閉じた直後のクリックで開き直してしまうため）
  const pointerOnButton = useRef(false)

  const dispatch = (event: MenuEvent) => {
    const result = menuReduce(state, event, disabled)
    setState(result.state)
    // 項目の実行より先にボタンへ戻す。名前の変更は編集欄が後からフォーカスを取る
    if (result.focusButton) buttonRef.current?.focus()
    if (result.activate !== undefined) items[result.activate]?.onSelect()
    return result
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (dispatch({ type: 'key', key: e.key, count: items.length }).handled) e.preventDefault()
  }

  // 開いたら置き場所を決める。ボタンが画面の外へ出たら閉じる。スクロールなどの置き直しは1フレームに1回
  useLayoutEffect(() => {
    if (!open) return
    let frame = 0
    const place = () => {
      frame = 0
      const button = buttonRef.current
      const menu = menuRef.current
      if (!button || !menu) return
      const r = button.getBoundingClientRect()
      const placement = placePopover(
        { x: r.left, y: r.top, width: r.width, height: r.height },
        { width: window.innerWidth, height: window.innerHeight },
        menu.scrollHeight,
        { align: 'end', minWidth: MENU_MIN_WIDTH, gap: MENU_GAP },
      )
      if (!placement) setState((s) => ({ ...s, open: false }))
      else setPosition(placement)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    place()
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) schedule()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', schedule)
    }
  }, [open])

  // フォーカス中の項目へ実際にフォーカスを移す
  const activeItemId = `${id}-item-${active}`
  useEffect(() => {
    if (open) document.getElementById(activeItemId)?.focus({ preventScroll: true })
  }, [open, activeItemId])

  // 外側を押したら閉じる
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setState((s) => ({ ...s, open: false }))
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <span
      className="row-menu"
      // フォーカスがボタンとメニューの両方から離れたら閉じる（別のウィンドウやタブへ移ったときも）
      onBlur={(e) => {
        if (pointerOnButton.current) return
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setState((s) => ({ ...s, open: false }))
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="row-menu-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onPointerDown={() => {
          pointerOnButton.current = true
        }}
        onPointerUp={() => {
          pointerOnButton.current = false
        }}
        onPointerLeave={() => {
          pointerOnButton.current = false
        }}
        onClick={() => dispatch({ type: 'toggle', count: items.length })}
        onKeyDown={onKeyDown}
      >
        <EllipsisVertical {...iconProps} />
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={`${id}-menu`}
          className="row-menu-list"
          role="menu"
          aria-label={label}
          // 置き場所が決まるまでは透明にしておく（visibility: hidden だとフォーカスを受け取れない）
          style={{ position: 'fixed', ...(position ?? { opacity: 0, pointerEvents: 'none', top: 0, left: 0 }) }}
          onKeyDown={onKeyDown}
          // 項目を押してもフォーカスがメニューの外（body）へ逃げないようにする（Safari）
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <Fragment key={item.label}>
                {/* 取り返しのつかない操作は区切り線で離す（キーボードの移動先には含めない） */}
                {item.danger && i > 0 && <li role="separator" className="row-menu-separator" />}
                <li
                  id={`${id}-item-${i}`}
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled || undefined}
                  // 押せない理由は スクリーンリーダーで読めるテキストにも残す（薄い色だけでは伝わらない）
                  aria-label={labelFor(item)}
                  title={item.hint}
                  className={`row-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
                  onMouseMove={() => i !== active && dispatch({ type: 'hover', index: i })}
                  onClick={() => dispatch({ type: 'click', index: i })}
                >
                  {Icon && <Icon {...iconProps} />}
                  {item.label}
                </li>
              </Fragment>
            )
          })}
        </ul>
      )}
    </span>
  )
}
