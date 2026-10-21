import { useEffect, useRef, useState } from 'react'
import { errorMessage } from './lineJobs'

/** 書き出した後に、使った声のクレジットを見せてコピーさせる */
export function CreditPanel({
  credit,
  onError,
  standalone = true,
}: {
  credit: string
  onError(message: string): void
  /** 自分の枠と見出しを持つ（false は、名前の付いたパネルの中に置くとき） */
  standalone?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credit)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      onError(`コピーできませんでした: ${errorMessage(e)}`)
    }
  }

  return (
    <section className={standalone ? 'panel' : 'credit-body'} aria-label="クレジット">
      {standalone && <h2>クレジット</h2>}
      <p className="hint">動画の概要欄などに、使った声のクレジットを書いてください。</p>
      <div className="field">
        <input type="text" readOnly value={credit} aria-label="クレジット" onFocus={(e) => e.target.select()} />
        <button type="button" onClick={() => void copy()}>
          {copied ? 'コピーしました' : 'コピー'}
        </button>
      </div>
    </section>
  )
}
