import { useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { iconProps } from './icons'
import { dismissHint, loadDismissedHints } from './dismissedHints'

interface Props {
  /** 閉じたことを覚えるための名前。説明ごとに変える */
  id: string
  children: ReactNode
}

/** ×で閉じられる説明。一度閉じたら、このブラウザでは次から出さない */
export function DismissibleHint({ id, children }: Props) {
  const [dismissed, setDismissed] = useState(() => loadDismissedHints().has(id))
  if (dismissed) return null
  return (
    <div className="hint dismissible-hint">
      <p>{children}</p>
      <button
        type="button"
        className="hint-close"
        aria-label="この説明を閉じる"
        onClick={() => {
          dismissHint(id)
          setDismissed(true)
        }}
      >
        <X {...iconProps} size={14} />
      </button>
    </div>
  )
}
