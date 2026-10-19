import { useEffect, useRef, useState } from 'react'

interface Props {
  name: string
  onRename(name: string): void
  onCancel(): void
}

/** 名前の編集欄。Enter かフォーカスを外すと確定、Esc で取り消し。空白だけの名前は確定しない。 */
export function InlineName({ name, onRename, onCancel }: Props) {
  const [draft, setDraft] = useState(name)
  // 確定・取り消しの後、要素が外れるときの blur で二重に呼ばないため
  const finished = useRef(false)
  // 開いたときは名前全体を選んでおき、そのまま打てば置き換えられるようにする
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.select(), [])
  const finish = (fn: () => void) => {
    if (finished.current) return
    finished.current = true
    fn()
  }
  const commit = () => {
    const trimmed = draft.trim()
    finish(trimmed === '' || trimmed === name ? onCancel : () => onRename(trimmed))
  }
  return (
    <input
      ref={inputRef}
      className="inline-name"
      value={draft}
      autoFocus
      aria-label="名前"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit()
        else if (e.key === 'Escape') finish(onCancel)
      }}
    />
  )
}
