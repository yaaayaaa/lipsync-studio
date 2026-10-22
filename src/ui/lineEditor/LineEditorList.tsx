import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { ArrowDown, ArrowUp, Copy, ListPlus, Plus, Trash2 } from 'lucide-react'
import { iconProps } from '../icons'
import type { ScriptLine } from '../../core/character/types'
import { ContextMenu } from '../ContextMenu'
import type { ContextMenuAt } from '../ContextMenu'
import { TunedMark } from '../script/LineFields'
import { isTuned } from '../script/lineText'

interface Props {
  lines: ScriptLine[]
  selectedId: string | null
  locked: boolean
  onSelect(lineId: string): void
  onAdd(): void
  /** index の位置に空の行を足す（0 が先頭） */
  onInsert(index: number): void
  onDuplicate(lineId: string): void
  /** 行を gap の位置（行の間の番号。0 が先頭の上）へ移す */
  onMove(lineId: string, gap: number): void
  onRemove(lineId: string): void
}

/** 押してからこれだけ動かしたらドラッグとみなす（押しただけの小さなぶれでは並べ替えない） */
const DRAG_THRESHOLD_PX = 4
/** 一覧の端からこれだけの所までドラッグしたら、一覧をスクロールする */
const AUTO_SCROLL_EDGE_PX = 24
const AUTO_SCROLL_STEP_PX = 12

interface Drag {
  lineId: string
  pointerId: number
  startY: number
  /** しきい値を超えて動かし始めたか */
  moving: boolean
  /** 入る位置（行の間の番号） */
  gap: number
}

/** ポインターの高さから、入る位置（行の間の番号）を決める。行の上半分なら上、下半分なら下 */
function gapAt(items: HTMLElement[], clientY: number): number {
  const index = items.findIndex((item) => {
    const r = item.getBoundingClientRect()
    return clientY < r.top + r.height / 2
  })
  return index < 0 ? items.length : index
}

/**
 * 行の番号と先頭の文。見出しはパネルのタブが兼ねる。
 * 右クリックで行の操作（追加・複製・移動・削除）、ドラッグで並べ替え、Alt+↑↓ でも移動できる
 */
export function LineEditorList({
  lines,
  selectedId,
  locked,
  onSelect,
  onAdd,
  onInsert,
  onDuplicate,
  onMove,
  onRemove,
}: Props) {
  const listRef = useRef<HTMLOListElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // ドラッグを離した直後のクリックで、行を選び直さない
  const suppressClick = useRef(false)
  const [menu, setMenu] = useState<{ lineId: string; at: ContextMenuAt } | null>(null)
  const buttonOf = (lineId: string) => listRef.current?.querySelector<HTMLButtonElement>(`[data-line-id="${lineId}"]`)

  const itemElements = () => [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > li') ?? [])]

  // マウスとペンだけでドラッグする（タッチでは一覧のスクロールを優先する）
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, lineId: string) => {
    // 離したあとにクリックが来ない（ポインターを捕まえて動かした）ときもあるので、ここで忘れる
    suppressClick.current = false
    if (locked || e.button !== 0 || e.pointerType === 'touch') return
    setDrag({ lineId, pointerId: e.pointerId, startY: e.clientY, moving: false, gap: 0 })
  }

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    if (!drag.moving && Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return
    if (!drag.moving) e.currentTarget.setPointerCapture(e.pointerId)
    const list = listRef.current?.closest<HTMLElement>('.dock-pane')
    if (list) {
      const r = list.getBoundingClientRect()
      if (e.clientY < r.top + AUTO_SCROLL_EDGE_PX) list.scrollTop -= AUTO_SCROLL_STEP_PX
      else if (e.clientY > r.bottom - AUTO_SCROLL_EDGE_PX) list.scrollTop += AUTO_SCROLL_STEP_PX
    }
    setDrag({ ...drag, moving: true, gap: gapAt(itemElements(), e.clientY) })
  }

  const endDrag = (e: PointerEvent<HTMLButtonElement>, drop: boolean) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    if (drag.moving) {
      suppressClick.current = true
      if (drop) onMove(drag.lineId, drag.gap)
    }
    setDrag(null)
  }

  const onKeyDown = (e: KeyboardEvent, lineId: string, index: number) => {
    if (locked || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    // 上へは1つ上の境目、下へは1つ下の行のさらに下の境目
    onMove(lineId, e.key === 'ArrowUp' ? index - 1 : index + 2)
    // 並びが変わっても、同じ行にフォーカスを残す
    requestAnimationFrame(() => buttonOf(lineId)?.focus())
  }

  const menuLine = menu && lines.findIndex((l) => l.id === menu.lineId)
  const closeMenu = () => {
    if (menu) buttonOf(menu.lineId)?.focus()
    setMenu(null)
  }
  const menuItems =
    menu && menuLine !== null && menuLine >= 0
      ? [
          { label: '上に行を追加', icon: ListPlus, onSelect: () => onInsert(menuLine) },
          { label: '下に行を追加', icon: Plus, onSelect: () => onInsert(menuLine + 1) },
          { label: '複製', icon: Copy, onSelect: () => onDuplicate(menu.lineId) },
          {
            label: '上へ移動',
            icon: ArrowUp,
            disabled: menuLine === 0,
            onSelect: () => onMove(menu.lineId, menuLine - 1),
          },
          {
            label: '下へ移動',
            icon: ArrowDown,
            disabled: menuLine === lines.length - 1,
            onSelect: () => onMove(menu.lineId, menuLine + 2),
          },
          { label: '削除', icon: Trash2, danger: true, onSelect: () => onRemove(menu.lineId) },
        ]
      : []

  const dragging = drag?.moving ? drag : null
  const draggedIndex = dragging ? lines.findIndex((l) => l.id === dragging.lineId) : -1
  // 入っても位置が変わらない境目（自分のすぐ上と下）には線を出さない
  const dropGap = dragging && dragging.gap !== draggedIndex && dragging.gap !== draggedIndex + 1 ? dragging.gap : null

  return (
    <section className={dragging ? 'line-editor-list dragging' : 'line-editor-list'} aria-label="セリフ一覧">
      <ol ref={listRef}>
        {lines.map((line, index) => {
          const classes = [
            dropGap === index && 'drop-before',
            dropGap === index + 1 && index === lines.length - 1 && 'drop-after',
            dragging?.lineId === line.id && 'dragged',
            menu?.lineId === line.id && 'menu-open',
          ].filter(Boolean)
          return (
            <li key={line.id} className={classes.length > 0 ? classes.join(' ') : undefined}>
              <button
                type="button"
                data-line-id={line.id}
                className={line.id === selectedId ? 'selected' : undefined}
                aria-current={line.id === selectedId ? 'true' : undefined}
                title={locked ? undefined : 'ドラッグで並べ替え・右クリックで操作'}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false
                    return
                  }
                  onSelect(line.id)
                }}
                onPointerDown={(e) => onPointerDown(e, line.id)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => endDrag(e, true)}
                onPointerCancel={(e) => endDrag(e, false)}
                onKeyDown={(e) => onKeyDown(e, line.id, index)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (locked) return
                  // キーボードのメニューキーでは位置が 0 になるので、行の左下に出す
                  const r = e.currentTarget.getBoundingClientRect()
                  const fromKeyboard = e.clientX === 0 && e.clientY === 0
                  setMenu({
                    lineId: line.id,
                    at: fromKeyboard ? { x: r.left, y: r.bottom } : { x: e.clientX, y: e.clientY },
                  })
                }}
              >
                <span className="line-editor-number">{index + 1}</span>
                <span className="line-editor-text">{line.text.trim() || '（空のセリフ）'}</span>
                {isTuned(line) && <TunedMark />}
              </button>
            </li>
          )
        })}
      </ol>
      <button type="button" className="add-line" disabled={locked} onClick={onAdd}>
        <Plus {...iconProps} />
        行を追加
      </button>
      <ContextMenu
        at={menu?.at ?? null}
        label={menuLine !== null && menuLine >= 0 ? `${menuLine + 1}行目の操作` : '行の操作'}
        items={menuItems}
        onClose={closeMenu}
      />
    </section>
  )
}
