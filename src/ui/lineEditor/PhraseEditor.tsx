import { useState } from 'react'
import type { AccentPhrase } from '../../core/voicevox/types'
import { errorMessage } from '../script/lineJobs'
import { AccentTab } from './AccentTab'
import { LengthTab, PitchTab } from './MoraSliders'
import type { EditResult } from './useLineTuning'

type Tab = 'accent' | 'pitch' | 'length'

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'accent', label: 'アクセント' },
  { id: 'pitch', label: '高さ' },
  { id: 'length', label: '長さ' },
]

/** 今の句と声から、エンジンを呼んで次の句を作る */
export type ComputePhrases = (phrases: AccentPhrase[], styleId: number) => Promise<AccentPhrase[]>

/** エンジンを呼んで句を作り直す（取り直し・読みの変更）。失敗したら行は変えずに投げる */
export type ChangePhrasesAsync = (compute: ComputePhrases) => Promise<EditResult>

/** 結果を入れられなかったときの知らせ */
const NOT_APPLIED: Record<Exclude<EditResult, 'applied'>, string> = {
  dropped: '内容が変わったため反映しませんでした',
  locked: '書き出し中のため反映しませんでした',
}

interface Props {
  /** 表示するアクセント句。取得できるまでは null */
  phrases: AccentPhrase[] | null
  /** 書き出し中・声がない・文が空など */
  disabled: boolean
  /** その場で決まる変更（高さ・長さ・無音） */
  onChange(fn: (phrases: AccentPhrase[]) => AccentPhrase[]): void
  onChangeAsync: ChangePhrasesAsync
}

/** アクセント句の編集欄（アクセント・区切り・読み／高さ／長さ）。行を変えたら作り直す（key に行 ID を渡す） */
export function PhraseEditor({ phrases, disabled, onChange, onChangeAsync }: Props) {
  const [tab, setTab] = useState<Tab>('accent')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 取り直しの間は編集欄を止める。行に入ったら true（失敗・入れなかったときは知らせて false） */
  const runAsync = async (compute: ComputePhrases): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      const result = await onChangeAsync(compute)
      if (result === 'applied') return true
      setError(NOT_APPLIED[result])
      return false
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const off = disabled || busy || phrases === null
  return (
    <section className="panel phrase-editor" aria-busy={busy}>
      <div className="phrase-editor-head">
        <div className="phrase-tabs" role="tablist" aria-label="アクセント句の編集">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`phrase-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="phrase-tab-panel"
              className={tab === t.id ? 'active' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {busy && (
          <span className="hint" role="status">
            取り直し中…
          </span>
        )}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div id="phrase-tab-panel" role="tabpanel" aria-labelledby={`phrase-tab-${tab}`}>
        {phrases === null ? (
          <p className="hint">{disabled ? 'セリフと声があると編集できます' : 'アクセント句を取得中…'}</p>
        ) : tab === 'accent' ? (
          <AccentTab phrases={phrases} disabled={off} onChangeAsync={runAsync} />
        ) : tab === 'pitch' ? (
          <PitchTab phrases={phrases} disabled={off} onChange={onChange} />
        ) : (
          <LengthTab phrases={phrases} disabled={off} onChange={onChange} />
        )}
      </div>
    </section>
  )
}
