import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { iconProps } from './icons'
import { placePopover } from './dropdownState'
import { searchGroups } from './groupSearch'
import type { PickerGroup } from './groupSearch'

export interface PickerSelection {
  groupId: string
  itemId: string
}

interface Props {
  /** 検索窓などの読み上げ名（例「キャラ・スタイル」「声」） */
  label: string
  /** 閉じているときに出す、今の選択 */
  current: string
  groups: readonly PickerGroup[]
  selected: PickerSelection | null
  onChoose(selection: PickerSelection): void
  /**
   * 見出しに入らない「選ばない」項目（1行編集の声の「デフォルト」など）。検索中は出さない。
   * title は、名前だけでは中身が分からないときにマウスを重ねて見せる説明
   */
  none?: { label: string; title?: string; selected: boolean; onChoose(): void }
  disabled: boolean
  /** 選べるものが1つもないときの案内 */
  emptyHint: string
}

// 候補が多い（話者は40人を超える）ので、ふつうのドロップダウンより高くする
const MENU_MAX_HEIGHT = 480
const MENU_MIN_WIDTH = 240

/**
 * 見出しごとに畳める選択欄（キャラ・スタイル、話者・声）。ふだんは今の選択だけを出したボタンで、
 * 押すとその下にメニューを浮かせて出し、上の検索窓で絞り込みながら選ぶ。選んだら閉じる。
 * 項目が多いと長くなるので見出しごとに畳む。開いたときは今の選択の見出しだけを開き、
 * 検索中は当たった見出しをすべて開いて見せる。
 * メニューは body に置いて画面に固定する（パネルの枠で切れたり、下のスライダーを押し下げたりしないように）
 */
export function GroupPicker({ label, current, groups, selected, onChoose, none, disabled, emptyHint }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // 開いて見せている見出し
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // Safari はボタンをクリックしてもフォーカスしないので、押している間はフォーカス離脱で閉じない
  const pointerOnButton = useRef(false)
  // 書き出しで止まったら閉じる
  if (open && disabled) setOpen(false)

  const found = searchGroups(groups, query)
  const searching = query.trim() !== ''
  const show = () => {
    setExpanded(new Set(selected ? [selected.groupId] : []))
    setPosition(null)
    setOpen(true)
  }
  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const close = (focusButton = false) => {
    setOpen(false)
    setQuery('')
    if (focusButton) buttonRef.current?.focus()
  }
  const choose = (selection: PickerSelection) => {
    onChoose(selection)
    close(true)
  }

  // 位置合わせや外側のクリックの効果から閉じる。毎回変わる関数で効果をやり直さないよう最新を参照で持つ
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  // メニューはボタンの下に置き、下に入らなければ上に出す。ボタンが画面の外へ出たら閉じる
  useLayoutEffect(() => {
    if (!open) return
    let frame = 0
    const place = () => {
      frame = 0
      const button = buttonRef.current
      if (!button) return
      const r = button.getBoundingClientRect()
      const placement = placePopover(
        { x: r.left, y: r.top, width: r.width, height: r.height },
        { width: window.innerWidth, height: window.innerHeight },
        // 見出しを開くと伸びるので、開いたときの高さでなく上限まで入る側を選ぶ
        MENU_MAX_HEIGHT,
        { minWidth: MENU_MIN_WIDTH, maxHeight: MENU_MAX_HEIGHT },
      )
      // 隠れたパネルに入ったとき（幅 0）も、宙に浮いたメニューを残さず閉じる
      if (!placement || r.width === 0) closeRef.current()
      else setPosition(placement)
    }
    // スクロールやサイズ変更が続いても、置き直しは1フレームに1回にまとめる
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    place()
    // 開いたらすぐ打てるように。autoFocus だとメニューの参照が付く前にフォーカスが移り、ボタンの離脱で閉じてしまう
    searchRef.current?.focus({ preventScroll: true })
    // メニューの中のスクロールは除く
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

  // 外側を押したら閉じる
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return
      closeRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // フォーカスがボタンとメニューの両方から離れたら閉じる。メニューは body に置くので、どちらの中かで見る
  const onBlur = (e: FocusEvent) => {
    if (pointerOnButton.current || !open) return
    const to = e.relatedTarget as Node | null
    if (buttonRef.current?.contains(to) || menuRef.current?.contains(to)) return
    close()
  }

  return (
    <div className="dropdown group-picker">
      <button
        ref={buttonRef}
        type="button"
        className="dropdown-button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // 欄の名前は外に出しているので、読み上げでは今の選択に添える
        aria-label={`${label}：${current}`}
        title={none?.selected ? none.title : undefined}
        disabled={disabled}
        onPointerDown={() => {
          pointerOnButton.current = true
        }}
        onPointerUp={() => {
          pointerOnButton.current = false
        }}
        onPointerLeave={() => {
          pointerOnButton.current = false
        }}
        onClick={() => (open ? close() : show())}
        onBlur={onBlur}
      >
        <span className="dropdown-name">{current}</span>
        <ChevronDown {...iconProps} className="dropdown-caret" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="group-picker-menu"
            // 置き場所が決まるまでは透明にしておく（visibility: hidden だと検索窓がフォーカスを受け取れない）
            style={{ position: 'fixed', ...(position ?? { opacity: 0, pointerEvents: 'none', top: 0, left: 0 }) }}
            onBlur={onBlur}
            onKeyDown={(e) => {
              // Esc はメニューのどこからでも閉じる。検索窓に文字があるときは、まず文字を消す（検索窓で処理済み）
              if (e.key === 'Escape' && !e.defaultPrevented) {
                e.preventDefault()
                close(true)
              }
            }}
          >
            <label className="group-picker-search">
              <Search {...iconProps} />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="検索"
                aria-label={`${label}を検索`}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // 検索中の Enter で一番上の候補を選ぶ。選ぶとフォーカスがボタンへ戻るので、同じ Enter でボタンを押して開き直さないよう止める
                  const first = found[0]
                  if (e.key === 'Enter' && searching && first) {
                    e.preventDefault()
                    choose({ groupId: first.id, itemId: first.items[0].id })
                  }
                  if (e.key === 'Escape' && query !== '') {
                    e.preventDefault()
                    setQuery('')
                  }
                }}
              />
            </label>
            {found.length === 0 && !(none && !searching) ? (
              <p className="hint">{groups.length === 0 ? emptyHint : '見つかりません'}</p>
            ) : (
              <div className="group-picker-list">
                {none && !searching && (
                  <button
                    type="button"
                    className={none.selected ? 'group-picker-none selected' : 'group-picker-none'}
                    aria-pressed={none.selected}
                    title={none.title}
                    onClick={() => {
                      none.onChoose()
                      close(true)
                    }}
                  >
                    <span className="group-picker-name">{none.label}</span>
                  </button>
                )}
                {found.map((group) => {
                  const unfolded = searching || expanded.has(group.id)
                  const itemsId = `${menuId}-${group.id}`
                  return (
                    <div key={group.id} className="group-picker-group">
                      <button
                        type="button"
                        className="group-picker-heading"
                        aria-expanded={unfolded}
                        aria-controls={itemsId}
                        // 検索中は当たったものを全部見せるので畳めない
                        disabled={searching}
                        onClick={() => toggleGroup(group.id)}
                      >
                        <ChevronRight {...iconProps} size={14} className="group-picker-chevron" />
                        <span className="group-picker-heading-name">{group.name}</span>
                        <span className="group-picker-count">{group.items.length}</span>
                      </button>
                      {unfolded && (
                        <div id={itemsId} role="group" aria-label={group.name}>
                          {group.items.map((item) => {
                            const isSelected = selected?.groupId === group.id && selected.itemId === item.id
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={isSelected ? 'group-picker-option selected' : 'group-picker-option'}
                                aria-pressed={isSelected}
                                onClick={() => choose({ groupId: group.id, itemId: item.id })}
                              >
                                <span className="group-picker-name">{item.name}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
