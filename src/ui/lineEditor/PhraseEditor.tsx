import { RefreshCw } from 'lucide-react'
import { iconProps } from '../icons'
import type { AccentPhrase } from '../../core/voicevox/types'
import { AccentTab } from './AccentTab'
import { LengthTab, PitchTab } from './MoraSliders'
import type { EditResult } from './useLineTuning'

export type PhraseEditorKind = 'accent' | 'pitch' | 'length'

/** 今の句と声から、エンジンを呼んで次の句を作る */
export type ComputePhrases = (phrases: AccentPhrase[], styleId: number) => Promise<AccentPhrase[]>

/** エンジンを呼んで句を作り直す（取り直し・読みの変更）。失敗したら行は変えずに投げる */
export type ChangePhrasesAsync = (compute: ComputePhrases) => Promise<EditResult>

interface Props {
  kind: PhraseEditorKind
  /** 表示するアクセント句。取得できるまでは null */
  phrases: AccentPhrase[] | null
  /** 書き出し中・声がない・文が空など */
  disabled: boolean
  /** 句を取得できなかった理由。あれば「取得中」の代わりに出し、onRetry で取り直す */
  loadError: string | null
  onRetry(): void
  /** その場で決まる変更（高さ・長さ・無音） */
  onChange(fn: (phrases: AccentPhrase[]) => AccentPhrase[]): void
  /** エンジンを呼ぶ変更（usePhraseAsync の run）。行に入ったら true */
  onChangeAsync(compute: ComputePhrases): Promise<boolean>
  /** エンジンを呼ぶ変更を待っている間。3つの欄とも止める */
  busy: boolean
  /** エンジンを呼ぶ変更が失敗した・入れなかった知らせ */
  error: string | null
}

/**
 * アクセント句の編集欄の1つ（アクセント・区切り・読み／高さ／長さ）。1行編集ではそれぞれが別のパネルになる。
 * 行を変えたら作り直す（key に行 ID を渡す）
 */
export function PhraseEditor({
  kind,
  phrases,
  disabled,
  loadError,
  onRetry,
  onChange,
  onChangeAsync,
  busy,
  error,
}: Props) {
  const off = disabled || busy || phrases === null
  return (
    <div className="phrase-editor" aria-busy={busy}>
      {busy && (
        <p className="hint" role="status">
          取り直し中…
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="phrase-editor-body">
        {phrases === null && disabled ? (
          <p className="hint">セリフと声があると編集できます</p>
        ) : phrases === null && loadError ? (
          <div className="phrase-load-error">
            <p className="notice error" role="alert">
              {loadError}
            </p>
            <button type="button" onClick={onRetry}>
              <RefreshCw {...iconProps} />
              再試行
            </button>
          </div>
        ) : phrases === null ? (
          <p className="hint">アクセント句を取得中…</p>
        ) : kind === 'accent' ? (
          <AccentTab phrases={phrases} disabled={off} onChangeAsync={onChangeAsync} />
        ) : kind === 'pitch' ? (
          <PitchTab phrases={phrases} disabled={off} onChange={onChange} />
        ) : (
          <LengthTab phrases={phrases} disabled={off} onChange={onChange} />
        )}
      </div>
    </div>
  )
}
