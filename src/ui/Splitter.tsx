import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

interface Props {
  /** 読み上げ用の名前（例：行の一覧の幅） */
  label: string
  /** vertical は縦の線（左右に動かして幅を変える）、horizontal は横の線（上下に動かして高さを変える） */
  orientation: 'vertical' | 'horizontal'
  value: number
  min: number
  max: number
  /** 右（下）へ動かすと値が増えるなら 1、減るなら -1 */
  direction: 1 | -1
  onChange(value: number): void
  /** ダブルクリックで既定の大きさに戻す */
  onReset(): void
}

const KEY_STEP = 10
const KEY_STEP_LARGE = 50

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** パネルの境目。ドラグ・矢印キー（Shift で大きく）で大きさを変え、ダブルクリックで戻す */
export function Splitter({ label, orientation, value, min, max, direction, onChange, onReset }: Props) {
  const drag = useRef<{ pointer: number; start: number; from: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const axis = (e: { clientX: number; clientY: number }) => (orientation === 'vertical' ? e.clientX : e.clientY)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointer: e.pointerId, start: axis(e), from: value }
    setDragging(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    onChange(clamp(d.from + direction * (axis(e) - d.start), min, max))
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== e.pointerId) return
    drag.current = null
    setDragging(false)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
    const sign = e.key === keys[0] ? -1 : e.key === keys[1] ? 1 : 0
    if (sign === 0) return
    e.preventDefault()
    onChange(clamp(value + direction * sign * (e.shiftKey ? KEY_STEP_LARGE : KEY_STEP), min, max))
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      className={dragging ? 'splitter dragging' : 'splitter'}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      title={`${label}（ドラグで変更・ダブルクリックで元に戻す）`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
    />
  )
}
