import { useRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { EllipsisVertical } from 'lucide-react'
import { iconProps } from '../icons'

export interface RowMenuItem {
  label: string
  danger?: boolean
  onSelect(): void
}

interface Props {
  /** ボタンの読み上げ名（例「キャラの操作」） */
  label: string
  items: RowMenuItem[]
}

/**
 * 一覧の行の「…」メニュー（Radix DropdownMenu）。中身は body へポータルで出すので列の枠で切れない。
 * 右端をボタンにそろえ、入らなければ Radix が反対側へずらす。
 */
export function RowMenu({ label, items }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <span className="row-menu">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger ref={triggerRef} className="row-menu-button" aria-label={label}>
          <EllipsisVertical {...iconProps} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="row-menu-list"
            aria-label={label}
            align="end"
            sideOffset={2}
            collisionPadding={8}
            // 閉じたあと Radix はボタンへフォーカスを戻す。名前の変更では編集欄が先にフォーカスを取っているので奪わない
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              const a = document.activeElement
              if (a === null || a === document.body) triggerRef.current?.focus()
            }}
          >
            {items.map((item) => (
              <DropdownMenu.Item
                key={item.label}
                className={`row-menu-item${item.danger ? ' danger' : ''}`}
                onSelect={item.onSelect}
              >
                {item.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </span>
  )
}
