import { useEffect, useRef, useState } from 'react'
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
} from '@floating-ui/react'
import { ChevronDown, EllipsisVertical } from 'lucide-react'
import pkg from '@floating-ui/react/package.json'
import type { Impl, LayerOption, LayerSelectDemoProps, RowMenuDemoProps } from '../contract'
import './floating.css'

function RowMenuDemo({ label, items, onSelect }: RowMenuDemoProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listRef = useRef<(HTMLElement | null)[]>([])
  const labelsRef = useRef(items.map((it) => it.label))

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(2),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(80, availableHeight)}px`
        },
      }),
    ],
  })
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: 'menu' }),
    useListNavigation(context, { listRef, activeIndex, onNavigate: setActiveIndex, loop: true }),
    useTypeahead(context, { listRef: labelsRef, activeIndex, onMatch: setActiveIndex }),
  ])

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={label}
        className="cmp-floating-row-button"
        {...getReferenceProps()}
      >
        <EllipsisVertical size={16} />
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus>
            <div
              ref={refs.setFloating}
              className="cmp-floating-menu"
              style={floatingStyles}
              {...getFloatingProps()}
            >
              {items.map((it, i) => (
                <button
                  key={it.id}
                  type="button"
                  role="menuitem"
                  ref={(node) => {
                    listRef.current[i] = node
                  }}
                  tabIndex={activeIndex === i ? 0 : -1}
                  className={`cmp-floating-item${it.danger ? ' danger' : ''}`}
                  {...getItemProps({
                    onClick() {
                      onSelect(it.id)
                      setOpen(false)
                    },
                  })}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}

function Thumb({ thumb, px }: { thumb: string | null; px: number }) {
  return (
    <span
      className={`cmp-floating-thumb${thumb === null ? ' empty' : ''}`}
      style={{ width: px, height: px }}
    >
      {thumb !== null && <img src={thumb} alt="" />}
    </span>
  )
}

function LayerSelectDemo({ label, options, value, onChange, onActiveChange }: LayerSelectDemoProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const listRef = useRef<(HTMLElement | null)[]>([])
  const labelsRef = useRef<string[]>([])
  // 先頭文字ジャンプはキー入力時に読むだけなので、描画中ではなく effect で最新にする
  useEffect(() => {
    labelsRef.current = options.map((o) => o.name)
  }, [options])

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  )
  const current: LayerOption | undefined = options[selectedIndex]

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(2),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
            maxHeight: `${Math.min(280, Math.max(80, availableHeight))}px`,
          })
        },
      }),
    ],
  })
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: 'listbox' }),
    useListNavigation(context, {
      listRef,
      activeIndex,
      selectedIndex,
      onNavigate: setActiveIndex,
      loop: true,
    }),
    useTypeahead(context, {
      listRef: labelsRef,
      activeIndex,
      selectedIndex,
      onMatch: open ? setActiveIndex : (i) => onChange(options[i]?.id ?? null),
    }),
  ])

  // 強調中の候補を親へ知らせる。閉じたら undefined
  const onActiveChangeRef = useRef(onActiveChange)
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange
  })
  const activeId = open && activeIndex !== null ? (options[activeIndex]?.id ?? null) : undefined
  useEffect(() => {
    onActiveChangeRef.current(activeId)
  }, [activeId])
  // 開いたまま外されても候補を残さない
  useEffect(() => () => onActiveChangeRef.current(undefined), [])

  return (
    <div className="cmp-floating-select">
      <button
        ref={refs.setReference}
        type="button"
        aria-label={`${label}: ${current?.name ?? '未設定'}`}
        className="cmp-floating-button"
        {...getReferenceProps()}
      >
        <Thumb thumb={current?.thumb ?? null} px={24} />
        <span className="cmp-floating-name">{current?.name ?? '未設定'}</span>
        <ChevronDown size={16} className="cmp-floating-caret" />
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              className="cmp-floating-list"
              style={floatingStyles}
              aria-label={label}
              {...getFloatingProps()}
            >
              {options.map((o, i) => (
                <div
                  key={o.id ?? ''}
                  role="option"
                  aria-selected={i === selectedIndex}
                  ref={(node) => {
                    listRef.current[i] = node
                  }}
                  tabIndex={i === activeIndex ? 0 : -1}
                  className={`cmp-floating-option${i === selectedIndex ? ' selected' : ''}`}
                  {...getItemProps({
                    onClick() {
                      onChange(o.id)
                      setOpen(false)
                    },
                    onKeyDown(e) {
                      if (e.key === 'Enter' || (e.key === ' ' && !context.dataRef.current.typing)) {
                        e.preventDefault()
                        onChange(o.id)
                        setOpen(false)
                      }
                    },
                  })}
                >
                  <Thumb thumb={o.thumb} px={32} />
                  <span className="cmp-floating-name">{o.name}</span>
                </div>
              ))}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  )
}

export const impl: Impl = {
  key: 'floating',
  name: 'Floating UI',
  packages: `@floating-ui/react@${pkg.version}`,
  RowMenuDemo,
  LayerSelectDemo,
  notes: [
    '非モーダル：FloatingFocusManager modal={false} で、ページはスクロールでき、別のトリガーも1クリックで開く（aria-hidden 化もしない）。',
    '部品ではなく「フック集」：見た目・DOM・role は全部自前で書く（約230行）。挙動（開閉・外側クリック・Esc・フォーカス移動/復帰・矢印）だけをライブラリが担当。',
    'onActiveChange：useListNavigation の onNavigate が activeIndex を返すので、それを id に直して effect で通知。ホバーでも onNavigate が走る（focusItemOnHover 既定）。閉じたら undefined を通知。',
    'キーボード：矢印は loop: true で循環、Home/End 対応、閉じた状態の矢印キーで開く。先頭文字ジャンプは useTypeahead（labelsRef に名前を渡す）。日本語はそのまま比較するので、IME 確定前の文字は拾えず、キーが直接入る場合の文字だけ（実質ひらがなは IME 経由で不安定）。',
    '位置決め：autoUpdate + offset/flip/shift/size。下に入らなければ上に出て、最大高さ（一覧は 280px）と最小幅（ボタン幅）は size ミドルウェアで設定。親スクロールにも追従。ボタンが画面外へ出ても自動では閉じない。',
    '面倒な点：Space/Enter での確定、role=option/menuitem の属性、tabIndex の付け方、listRef/labelsRef の用意は自分で書く必要がある。FloatingPortal が body 直下に出すので z-index は自前で上げる。',
    '統合時に修正: 挙動はそのまま動いた。lint（描画中の ref 書き込み）だけ直し、labelsRef の更新を effect へ移した',
  ],
}
