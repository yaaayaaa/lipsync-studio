import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { iconProps } from './icons'
import { dropdownReduce, placePopover } from './dropdownState'
import type { DropdownEvent } from './dropdownState'

export interface DropdownItem<T> {
  value: T
  /** 一覧での名前 */
  label: string
  /** 閉じたボタンに出す名前。なければ label（一覧では見出しで分かる話者名を、ボタンでは足すなど） */
  buttonLabel?: string
  /** 名前の前に置くもの（レイヤーの縮小画像など） */
  leading?: ReactNode
  /** 見出し。続く項目が同じ見出しなら、最初の前に1回だけ出す */
  group?: string
}

interface Props<T> {
  /** ボタンと一覧の読み上げ名 */
  label: string
  items: readonly DropdownItem<T>[]
  value: T
  onChange(value: T): void
  disabled?: boolean
  /** 開いているか。親が持つとき（同時に1つだけ開くなど）に渡す。なければ自分で持つ */
  open?: boolean
  onOpenChange?(open: boolean): void
  /** 開いている間に強調中の選択肢が変わるたびに呼ぶ。閉じたら undefined */
  onActiveChange?(value: T | undefined): void
  /** 幅や縮小画像の大きさを場所ごとに変えるための名前 */
  className?: string
}

/**
 * 自前のドロップダウン（ブラウザ標準の select の代わり。見た目をアプリに合わせ、画像や見出しを出せるようにする）。
 * 開いている間は一覧にフォーカスを移し、強調中の選択肢を aria-activedescendant で示す。
 * 一覧は body に置いて画面に固定する（パネルの枠で切れたり、パネルの中の基準でずれたりしないように）
 */
export function Dropdown<T>({
  label,
  items,
  value,
  onChange,
  disabled = false,
  open: openProp,
  onOpenChange,
  onActiveChange,
  className,
}: Props<T>) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [ownOpen, setOwnOpen] = useState(false)
  const open = (openProp ?? ownOpen) && !disabled
  const setOpen = (next: boolean) => {
    setOwnOpen(next)
    onOpenChange?.(next)
  }
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  // Safari はボタンをクリックしてもフォーカスしないので、押している間はフォーカス離脱で閉じない
  const pointerOnButton = useRef(false)

  const selected = items.findIndex((it) => Object.is(it.value, value))
  const current = selected >= 0 ? items[selected] : null
  const optionId = (i: number) => `${id}-option-${i}`

  const dispatch = (event: DropdownEvent) => {
    const result = dropdownReduce({ open, active }, event)
    setActive(result.state.active)
    if (result.state.open !== open) setOpen(result.state.open)
    if (result.choose !== undefined && items[result.choose]) onChange(items[result.choose].value)
    if (result.focusButton) buttonRef.current?.focus()
    return result
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (dispatch({ type: 'key', key: e.key, selected, count: items.length }).handled) e.preventDefault()
  }

  // 閉じる処理は位置合わせの効果からも呼ぶ。毎回変わる関数で効果をやり直さない（一覧へのフォーカスが動く）よう最新を参照で持つ
  const setOpenRef = useRef(setOpen)
  const onActiveChangeRef = useRef(onActiveChange)
  useEffect(() => {
    setOpenRef.current = setOpen
    onActiveChangeRef.current = onActiveChange
  })

  // 強調中の選択肢を知らせる（口の選択で、プレビューに試し見せするため）
  const activeItem = open ? items[Math.min(active, items.length - 1)] : undefined
  const activeValue = activeItem?.value
  useEffect(() => {
    onActiveChangeRef.current?.(activeValue)
  }, [activeValue])
  // 開いたまま消えても（口グループの変更など）、試し見せの候補を残さない
  useEffect(() => () => onActiveChangeRef.current?.(undefined), [])

  // 一覧はボタンの下に置き、下に入らなければ上に出す
  useLayoutEffect(() => {
    if (!open) return
    let frame = 0
    const place = () => {
      frame = 0
      const button = buttonRef.current
      const list = listRef.current
      if (!button || !list) return
      const r = button.getBoundingClientRect()
      const placement = placePopover(
        { x: r.left, y: r.top, width: r.width, height: r.height },
        { width: window.innerWidth, height: window.innerHeight },
        list.scrollHeight,
      )
      // ボタンが画面の外へ出たら（隠れたパネルに入ったときも）、宙に浮いた一覧を残さず閉じる
      if (!placement || r.width === 0) setOpenRef.current(false)
      else setPosition(placement)
    }
    // スクロールやサイズ変更が続いても、置き直しは1フレームに1回にまとめる
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    place()
    listRef.current?.focus({ preventScroll: true })
    // 親の列がスクロールしたり画面の大きさが変わったら置き直す（一覧の中のスクロールは除く）
    const onScroll = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) schedule()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', schedule)
    }
  }, [open])

  // 外側を押したら閉じる
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpenRef.current(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // 強調中の選択肢を見える位置に保つ
  const activeOptionId = optionId(active)
  useEffect(() => {
    if (open) document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeOptionId])

  // フォーカスがボタンと一覧の両方から離れたら閉じる（別のウィンドウやタブへ移ったときも）。
  // 一覧は body に置くので、包みの中かどうかでなく、ボタンか一覧の中かで見る
  const onBlur = (e: FocusEvent) => {
    if (pointerOnButton.current || !open) return
    const to = e.relatedTarget as Node | null
    if (buttonRef.current?.contains(to) || listRef.current?.contains(to)) return
    setOpen(false)
  }

  const buttonText = current ? (current.buttonLabel ?? current.label) : ''

  return (
    <div className={className ? `dropdown ${className}` : 'dropdown'}>
      <button
        ref={buttonRef}
        type="button"
        className="dropdown-button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${buttonText}`}
        onPointerDown={() => {
          pointerOnButton.current = true
        }}
        onPointerUp={() => {
          pointerOnButton.current = false
        }}
        onPointerLeave={() => {
          pointerOnButton.current = false
        }}
        onClick={() => dispatch({ type: 'toggle', selected })}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      >
        {current?.leading}
        <span className="dropdown-name">{buttonText}</span>
        <ChevronDown className="dropdown-caret" {...iconProps} />
      </button>
      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={`${id}-list`}
            className={className ? `dropdown-list ${className}-list` : 'dropdown-list'}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={optionId(active)}
            // 置き場所が決まるまでは透明にしておく（visibility: hidden だとフォーカスを受け取れない）
            style={{ position: 'fixed', ...(position ?? { opacity: 0, pointerEvents: 'none', top: 0, left: 0 }) }}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
          >
            {items.map((it, i) => (
              <DropdownRow
                key={i}
                heading={it.group !== undefined && it.group !== items[i - 1]?.group ? it.group : null}
              >
                <li
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === selected}
                  className={`dropdown-option${i === active ? ' active' : ''}${i === selected ? ' selected' : ''}`}
                  onMouseMove={() => i !== active && dispatch({ type: 'hover', index: i })}
                  onClick={() => {
                    onChange(it.value)
                    setOpen(false)
                    buttonRef.current?.focus()
                  }}
                >
                  {it.leading}
                  <span className="dropdown-name">{it.label}</span>
                </li>
              </DropdownRow>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}

/** 選択肢の前に見出しを置く。見出しは選べないので、読み上げでは飾りとして扱う */
function DropdownRow({ heading, children }: { heading: string | null; children: ReactNode }) {
  return (
    <>
      {heading !== null && (
        <li role="presentation" className="dropdown-group">
          {heading}
        </li>
      )}
      {children}
    </>
  )
}
