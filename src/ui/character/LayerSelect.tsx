import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { LayerId, LayerNode, VisibilityState } from '../../core/psd/types'
import type { PsdSize } from '../usePsd'
import { dropdownReduce } from './dropdown'
import type { DropdownEvent } from './dropdown'
import { LayerThumb } from './LayerThumb'

export interface LayerOption {
  node: LayerNode
  /** 表示名（グループならパス付きなど） */
  label: string
}

interface Props {
  /** ボタンの読み上げ名（例「あの口」「口グループ」） */
  label: string
  /** 選択肢（上から順）。先頭に「未設定」が付く */
  options: LayerOption[]
  value: LayerId | null
  /** 開いているか。同時に1つだけ開くよう親が持つ */
  open: boolean
  onOpenChange(open: boolean): void
  onChange(layerId: LayerId | null): void
  visibility: VisibilityState
  psdSize: PsdSize
}

const POPOVER_MAX_HEIGHT = 280
const POPOVER_MIN_WIDTH = 200
const SCREEN_MARGIN = 8

/**
 * レイヤーを選ぶ縮小画像付きのドロップダウン（標準の select は画像を出せないため自作）。口グループと母音の口で使う。
 * 開いている間は一覧にフォーカスを移し、強調中の選択肢を aria-activedescendant で示す。
 */
export function LayerSelect({ label, options, value, open, onOpenChange, onChange, visibility, psdSize }: Props) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<CSSProperties | null>(null)

  // 先頭（0）は「未設定」
  const items: { id: LayerId | null; name: string; node: LayerNode | null }[] = [
    { id: null, name: '未設定', node: null },
    ...options.map((o) => ({ id: o.node.id, name: o.label, node: o.node })),
  ]
  const selected = items.findIndex((it) => it.id === value)
  const current = selected >= 0 ? items[selected] : null
  const optionId = (i: number) => `${id}-option-${i}`

  const dispatch = (event: DropdownEvent) => {
    const result = dropdownReduce({ open, active }, event)
    setActive(result.state.active)
    if (result.state.open !== open) onOpenChange(result.state.open)
    if (result.choose !== undefined) onChange(items[result.choose].id)
    if (result.focusButton) buttonRef.current?.focus()
    return result
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (dispatch({ type: 'key', key: e.key, selected, count: items.length }).handled) e.preventDefault()
  }

  // 一覧はパネルの枠で切れないよう画面に固定して置き、下に入らなければ上に出す
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const button = buttonRef.current
      const list = listRef.current
      if (!button || !list) return
      const r = button.getBoundingClientRect()
      const needed = Math.min(list.scrollHeight, POPOVER_MAX_HEIGHT)
      const below = window.innerHeight - r.bottom - SCREEN_MARGIN
      const above = r.top - SCREEN_MARGIN
      const downward = below >= needed || below >= above
      const maxHeight = Math.min(POPOVER_MAX_HEIGHT, downward ? below : above)
      const width = Math.max(r.width, POPOVER_MIN_WIDTH)
      const left = Math.max(SCREEN_MARGIN, Math.min(r.left, window.innerWidth - width - SCREEN_MARGIN))
      setPosition({
        left,
        width,
        maxHeight,
        ...(downward ? { top: r.bottom + 2 } : { bottom: window.innerHeight - r.top + 2 }),
      })
    }
    place()
    listRef.current?.focus({ preventScroll: true })
    // 親の列がスクロールしたり画面の大きさが変わったら置き直す（一覧の中のスクロールは除く）
    const onScroll = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) place()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // 外側を押したら閉じる
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t) || listRef.current?.contains(t)) return
      onOpenChange(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, onOpenChange])

  // 強調中の選択肢を見える位置に保つ
  const activeOptionId = optionId(active)
  useEffect(() => {
    if (open) document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeOptionId])

  return (
    <div className="layer-select">
      <button
        ref={buttonRef}
        type="button"
        className="layer-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${current?.name ?? '未設定'}`}
        onClick={() => dispatch({ type: 'toggle', selected })}
        onKeyDown={onKeyDown}
      >
        <LayerThumb node={current?.node ?? null} visibility={visibility} psdSize={psdSize} />
        <span className="layer-select-name">{current?.name ?? '未設定'}</span>
        <span className="layer-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          className="layer-select-list"
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={optionId(active)}
          style={{ position: 'fixed', ...(position ?? { visibility: 'hidden', top: 0, left: 0 }) }}
          onKeyDown={onKeyDown}
        >
          {items.map((it, i) => (
            <li
              key={it.id ?? ''}
              id={optionId(i)}
              role="option"
              aria-selected={i === selected}
              className={`layer-select-option${i === active ? ' active' : ''}${i === selected ? ' selected' : ''}`}
              onMouseMove={() => i !== active && dispatch({ type: 'hover', index: i })}
              onClick={() => {
                onChange(it.id)
                onOpenChange(false)
                buttonRef.current?.focus()
              }}
            >
              <LayerThumb node={it.node} visibility={visibility} psdSize={psdSize} />
              <span className="layer-select-name">{it.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
