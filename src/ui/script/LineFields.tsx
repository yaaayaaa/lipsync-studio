import type { Ref } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { iconProps } from '../icons'
import type { ScriptLine } from '../../core/character/types'
import { applyTextChange } from './lineText'

// 台本の行の文の欄と、作り込み済みの印。

interface TextProps {
  line: ScriptLine
  disabled: boolean
  label: string
  rows?: number
  onEdit(fn: (line: ScriptLine) => ScriptLine): void
  ref?: Ref<HTMLTextAreaElement>
}

/** セリフの文の欄。この欄は複数行なので Enter は改行のまま */
export function LineTextArea({ line, disabled, label, rows = 2, onEdit, ref }: TextProps) {
  return (
    <textarea
      ref={ref}
      className="line-text"
      rows={rows}
      value={line.text}
      placeholder="セリフを入力"
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const text = e.target.value
        onEdit((current) => applyTextChange(current, text))
      }}
    />
  )
}

/** 作り込み済みの行の印。押しても何も起きない */
export function TunedMark() {
  return (
    <span className="line-tuned" role="img" aria-label="作り込み済み" title="作り込み済み">
      <SlidersHorizontal {...iconProps} />
    </span>
  )
}
