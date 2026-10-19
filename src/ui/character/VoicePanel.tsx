import { useEffect, useState } from 'react'
import type { VoiceRef } from '../../core/character/types'
import type { Speaker } from '../../core/voicevox/types'
import { useApp } from '../useApp'

interface Props {
  voice: VoiceRef | null
  onChange(voice: VoiceRef | null): void
}

type SpeakersState = { status: 'loading' } | { status: 'ready'; speakers: Speaker[] } | { status: 'error'; detail: string }

export function VoicePanel({ voice, onChange }: Props) {
  const { client } = useApp()
  const [state, setState] = useState<SpeakersState>({ status: 'loading' })

  // 再接続ボタンで数字を進めて読み直す
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    client.speakers().then(
      (speakers) => !cancelled && setState({ status: 'ready', speakers }),
      (e: unknown) => !cancelled && setState({ status: 'error', detail: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [client, attempt])

  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  const select = (value: string) => {
    if (value === '' || state.status !== 'ready') return onChange(null)
    const styleId = Number(value)
    for (const sp of state.speakers) {
      const style = sp.styles.find((s) => s.id === styleId)
      if (style) return onChange({ styleId, speakerName: sp.name, styleName: style.name })
    }
  }

  const known = state.status === 'ready' && state.speakers.some((sp) => sp.styles.some((s) => s.id === voice?.styleId))

  return (
    <section className="panel">
      <h2>声</h2>
      {state.status === 'error' && (
        <div className="notice error">
          <p>VOICEVOX に接続できません</p>
          <p className="detail">{state.detail}</p>
          <button type="button" onClick={retry}>
            再接続
          </button>
        </div>
      )}
      <select
        value={voice ? String(voice.styleId) : ''}
        onChange={(e) => select(e.target.value)}
        disabled={state.status !== 'ready'}
        aria-label="話者とスタイル"
      >
        <option value="">{state.status === 'loading' ? '話者を読み込み中…' : '未設定'}</option>
        {voice && !known && (
          <option value={String(voice.styleId)}>
            {voice.speakerName}（{voice.styleName}）
          </option>
        )}
        {state.status === 'ready' &&
          state.speakers.map((sp) => (
            <optgroup key={`${sp.speaker_uuid}:${sp.name}`} label={sp.name}>
              {sp.styles.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {sp.name}（{s.name}）
                </option>
              ))}
            </optgroup>
          ))}
      </select>
    </section>
  )
}
