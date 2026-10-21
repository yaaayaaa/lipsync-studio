import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { iconProps } from './icons'

export interface Choice<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  /** 消すなど、戻せない選択。赤で出す */
  danger?: boolean
}

interface Props<T extends string> {
  open: boolean
  title: string
  children?: ReactNode
  choices: readonly Choice<T>[]
  /** 何もしないで閉じるボタン。Esc でも同じになる */
  cancelLabel: string
  /** 選んだ値。何もしないで閉じたら null。ダイアログを閉じてから呼ぶので、ここでフォーカスを動かせる */
  onClose(value: T | null): void
}

/**
 * 選ぶまで画面のほかの部分を触れなくするダイアログ（ブラウザの confirm の代わり。配色をアプリに合わせ、
 * ボタンに何が起きるかを書けるようにする）。最初のフォーカスは、押しても何も起きない「やめる」側に置く。
 * 置き場は body。呼んだ部品が1行編集の隠れたタブの中だと、文書から外されていて開けないため
 */
export function ChoiceDialog<T extends string>({ open, title, children, choices, cancelLabel, onClose }: Props<T>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog || dialog.open) return
    // 前に選んだ値が残っていると、Esc で閉じたときにそれを選んだことになる
    dialog.returnValue = ''
    dialog.showModal()
    cancelRef.current?.focus()
  }, [open])

  // 閉じている間は置かない（セリフの一覧の行ごとに空のダイアログを持たないように）
  if (!open) return null
  return createPortal(
    <dialog
      ref={dialogRef}
      className="choice-dialog"
      aria-labelledby="choice-dialog-title"
      onClose={(e) => {
        const value = e.currentTarget.returnValue
        onClose(choices.find((c) => c.value === value)?.value ?? null)
      }}
    >
      <h2 id="choice-dialog-title">{title}</h2>
      {children}
      <div className="choice-dialog-actions">
        {choices.map(({ value, label, icon: Icon, danger }) => (
          <button
            key={value}
            type="button"
            className={danger ? 'danger' : undefined}
            onClick={() => dialogRef.current?.close(value)}
          >
            {Icon && <Icon {...iconProps} />}
            {label}
          </button>
        ))}
        <button ref={cancelRef} type="button" onClick={() => dialogRef.current?.close()}>
          {cancelLabel}
        </button>
      </div>
    </dialog>,
    document.body,
  )
}
