import { Fragment, useState } from 'react'
import { Check, Link, Pencil, X } from 'lucide-react'
import { iconProps } from '../icons'
import { useApp } from '../useApp'
import { joinPhrases, refetchPhrases, replaceReading, setAccent, splitPhrase } from '../../core/voicevox/phraseEdit'
import type { AccentPhrase } from '../../core/voicevox/types'
import type { ComputePhrases } from './PhraseEditor'

interface Props {
  phrases: AccentPhrase[]
  disabled: boolean
  /** エンジンを呼ぶ変更。成功したら true */
  onChangeAsync(compute: ComputePhrases): Promise<boolean>
}

const reading = (p: AccentPhrase) => p.moras.map((m) => m.text).join('')

/** 東京式の高低（1 始まりのアクセント位置で下がる）。1拍目は、アクセントが1拍目でなければ低い */
function isHigh(accent: number, i: number): boolean {
  return accent === 1 ? i === 0 : i > 0 && i < accent
}

/** 句の高低の線。モーラの並びと同じ幅で描く */
function AccentLine({ phrase }: { phrase: AccentPhrase }) {
  const n = phrase.moras.length
  const points = phrase.moras.map((_, i) => `${i + 0.5},${isHigh(phrase.accent, i) ? 0.25 : 0.75}`).join(' ')
  return (
    <svg className="accent-line" viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * アクセント：モーラをクリックすると、そこで下がる（アクセント位置）。モーラの間をクリックすると句を分け、
 * 句の境目のボタンでつなぐ。モーラの文字をダブルクリック（または鉛筆のボタン）で読みを直す。
 */
export function AccentTab({ phrases, disabled, onChangeAsync }: Props) {
  const { client } = useApp()
  // 読みを直している句と、その欄の文字
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null)

  // 句の数や並びが変わる変更の前に、読みの欄は閉じる（開いている句の番号がずれるため）
  const run = (compute: ComputePhrases) => {
    setEditing(null)
    void onChangeAsync(compute)
  }
  const changeAccent = (index: number, accent: number) => {
    if (phrases[index]?.accent === accent) return
    run((ps, styleId) => refetchPhrases(client, setAccent(ps, index, accent), [index], styleId))
  }
  const split = (index: number, moraIndex: number) =>
    run((ps, styleId) => refetchPhrases(client, splitPhrase(ps, index, moraIndex), [index, index + 1], styleId))
  const join = (index: number) =>
    run((ps, styleId) => refetchPhrases(client, joinPhrases(ps, index), [index], styleId))

  const openReading = (index: number) => {
    if (disabled) return
    const p = phrases[index]
    if (p) setEditing({ index, text: reading(p) })
  }
  const submitReading = async () => {
    if (!editing) return
    const { index, text } = editing
    if (text === reading(phrases[index]!)) return setEditing(null)
    const ok = await onChangeAsync((ps, styleId) => replaceReading(client, ps, index, text, styleId))
    // 失敗したら欄を開いたままにして、直してもう一度送れるようにする
    if (ok) setEditing(null)
  }

  return (
    <div className="phrase-strip">
      {phrases.map((p, pi) => (
        <Fragment key={pi}>
          {pi > 0 && (
            <button
              type="button"
              className="phrase-join"
              disabled={disabled}
              aria-label={`${pi}句目と${pi + 1}句目をつなぐ`}
              title="句をつなぐ"
              onClick={() => join(pi - 1)}
            >
              <Link {...iconProps} />
            </button>
          )}
          <div className="phrase">
            {editing?.index === pi ? (
              <form
                className="phrase-reading"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitReading()
                }}
              >
                <input
                  type="text"
                  value={editing.text}
                  // 開いたらすぐ打てるように
                  autoFocus
                  disabled={disabled}
                  aria-label={`${pi + 1}句目の読み（カタカナ）`}
                  onChange={(e) => setEditing({ index: pi, text: e.target.value })}
                  onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                />
                <button type="submit" disabled={disabled} aria-label="読みを確定">
                  <Check {...iconProps} />
                </button>
                <button type="button" disabled={disabled} aria-label="読みの変更を取りやめる" onClick={() => setEditing(null)}>
                  <X {...iconProps} />
                </button>
              </form>
            ) : (
              <>
                <div className="phrase-moras" style={{ gridTemplateColumns: `repeat(${p.moras.length}, var(--mora-width))` }}>
                  <AccentLine phrase={p} />
                  {p.moras.map((m, mi) => (
                    <div key={mi} className="mora-cell">
                      <button
                        type="button"
                        className={p.accent === mi + 1 ? 'accent-point accent' : 'accent-point'}
                        disabled={disabled}
                        aria-pressed={p.accent === mi + 1}
                        aria-label={`${pi + 1}句目のアクセントを「${m.text}」（${mi + 1}拍目）にする`}
                        title="ここで下がる"
                        onClick={() => changeAccent(pi, mi + 1)}
                      >
                        <span className={isHigh(p.accent, mi) ? 'accent-dot high' : 'accent-dot'} />
                      </button>
                      {/* 読みはモーラの文字をダブルクリックで直す（VOICEVOX と同じ） */}
                      <span className="mora-label" onDoubleClick={() => openReading(pi)}>
                        {m.text}
                      </span>
                      {mi > 0 && (
                        <button
                          type="button"
                          className="mora-split"
                          disabled={disabled}
                          aria-label={`${pi + 1}句目を「${m.text}」（${mi + 1}拍目）の前で区切る`}
                          title="ここで区切る"
                          onClick={() => split(pi, mi)}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="phrase-foot">
                  <button
                    type="button"
                    className="phrase-edit-reading"
                    disabled={disabled}
                    aria-label={`${pi + 1}句目の読みを直す`}
                    title="読みを直す（モーラの文字をダブルクリックでも開きます）"
                    onClick={() => openReading(pi)}
                  >
                    <Pencil {...iconProps} />
                  </button>
                  {p.pause_mora && <span className="phrase-pause">、</span>}
                  {p.is_interrogative && <span className="phrase-pause">？</span>}
                </div>
              </>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  )
}
