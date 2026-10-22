import { useState } from 'react'
import { Download, Film, FolderArchive } from 'lucide-react'
import { iconProps } from '../icons'
import { ContextMenu } from '../ContextMenu'
import type { ContextMenuAt } from '../ContextMenu'
import type { BulkMode } from './bulkExportPlan'
import type { BulkExportState } from './useBulkExport'

interface Props {
  status: BulkExportState
  /** 書き出せる行が1つもないとき false */
  canExport: boolean
  /** 1行の書き出しなど、ほかの書き出しが動いている */
  locked: boolean
  onExport(mode: BulkMode): void
  onAbort(): void
}

/**
 * セリフ一覧の一番下の「まとめて書き出し」。押すと、1本の mp4 につなぐか、行ごとの mp4 を zip で受け取るかを選ぶ。
 * 書き出している間はボタンの代わりに進み具合と中止を出す
 */
export function BulkExport({ status, canExport, locked, onExport, onAbort }: Props) {
  const [menuAt, setMenuAt] = useState<ContextMenuAt | null>(null)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)

  if (status.state === 'exporting') {
    const percent = Math.round(status.progress * 100)
    return (
      <div className="bulk-export">
        <p className="hint" role="status">
          {status.total}行中 {status.position + 1}行目（{status.lineNumber}行目）を書き出し中… {percent}%
        </p>
        <progress max={1} value={(status.position + status.progress) / status.total} />
        <button type="button" onClick={onAbort}>
          中止
        </button>
      </div>
    )
  }

  return (
    <div className="bulk-export">
      {status.state !== 'idle' && (
        <p className={status.state === 'error' ? 'line-problem' : 'hint'} role="status">
          {status.message}
        </p>
      )}
      <button
        ref={setButton}
        type="button"
        className="bulk-export-button"
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        disabled={locked || !canExport}
        title={canExport ? undefined : '書き出せる行がありません（キャラ・声・口・文がそろった行が必要です）'}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenuAt(menuAt ? null : { x: r.left, y: r.top, width: r.width, height: r.height })
        }}
      >
        <Download {...iconProps} />
        まとめて書き出し
      </button>
      <ContextMenu
        at={menuAt}
        label="まとめて書き出し"
        anchor={button}
        items={[
          { label: '1つの mp4 にまとめる', icon: Film, onSelect: () => onExport('joined') },
          { label: 'セリフごとの mp4 を zip で', icon: FolderArchive, onSelect: () => onExport('zip') },
        ]}
        onClose={() => {
          setMenuAt(null)
          button?.focus()
        }}
      />
    </div>
  )
}
