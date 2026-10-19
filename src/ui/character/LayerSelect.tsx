import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { iconProps } from '../icons'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { LayerId, LayerNode, VisibilityState } from '../../core/psd/types'
import type { PsdSize } from '../usePsd'
import { dropdownReduce, placePopover } from './dropdown'
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
  /** 開いている間に強調中の選択肢が変わるたびに呼ぶ（null は「未設定」）。閉じたら undefined */
  onActiveChange?(layerId: LayerId | null | undefined): void
  visibility: VisibilityState
  psdSize: PsdSize
}


/**
 * レイヤーを選ぶ縮小画像付きのドロップダウン（標準の select は画像を出せないため自作）。口グループと母音の口で使う。
 * 開いている間は一覧にフォーカスを移し、強調中の選択肢を aria-activedescendant で示す。
 */
export function LayerSelect({
  label,
  options,
  value,
  open,
  onOpenChange,
  onChange,
  onActiveChange,
  visibility,
  psdSize,
}: Props) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  // Safari はボタンをクリックしてもフォーカスしないので、押している間はフォーカス離脱で閉じない
  const pointerOnButton = useRef(false)

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

  // 閉じる処理は位置合わせの効果からも呼ぶ。毎回変わる関数で効果をやり直さない（一覧へのフォーカスが動く）よう最新を参照で持つ
  const onOpenChangeRef = useRef(onOpenChange)
  const onActiveChangeRef = useRef(onActiveChange)
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
    onActiveChangeRef.current = onActiveChange
  })

  // 強調中の選択肢を知らせる（プレビューで試し見せするため）
  const activeItemId = open ? (items[Math.min(active, items.length - 1)]?.id ?? null) : undefined
  useEffect(() => {
    onActiveChangeRef.current?.(activeItemId)
  }, [activeItemId])
  // 開いたまま消えても（口グループの変更など）、試し見せの候補を残さない
  useEffect(() => () => onActiveChangeRef.current?.(undefined), [])

  // 一覧はパネルの枠で切れないよう画面に固定して置き、下に入らなければ上に出す
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
      // ボタンが画面の外へ出たら、宙に浮いた一覧を残さず閉じる
      if (!placement) onOpenChangeRef.current(false)
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
      onOpenChangeRef.current(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // 強調中の選択肢を見える位置に保つ
  const activeOptionId = optionId(active)
  useEffect(() => {
    if (open) document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeOptionId])

  return (
    <div
      className="layer-select"
      // フォーカスがボタンと一覧の両方から離れたら閉じる（別のウィンドウやタブへ移ったときも）
      onBlur={(e) => {
        if (pointerOnButton.current) return
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) onOpenChange(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="layer-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${current?.name ?? '未設定'}`}
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
      >
        <LayerThumb node={current?.node ?? null} visibility={visibility} psdSize={psdSize} />
        <span className="layer-select-name">{current?.name ?? '未設定'}</span>
        <ChevronDown className="layer-select-caret" {...iconProps} />
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
          // 置き場所が決まるまでは透明にしておく（visibility: hidden だとフォーカスを受け取れない）
          style={{ position: 'fixed', ...(position ?? { opacity: 0, pointerEvents: 'none', top: 0, left: 0 }) }}
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
