import { useEffect, useState } from 'react'
import type { VoiceRef } from '../core/character/types'
import type { Speaker } from '../core/voicevox/types'
import { Dropdown } from './Dropdown'
import type { DropdownItem } from './Dropdown'
import { useApp } from './useApp'

interface Props {
  voice: VoiceRef | null
  onChange(voice: VoiceRef | null): void
  /** 声を選ばない（null）ときの項目の名前。キャラ設定では「未設定」、1行編集では「キャラの声」 */
  noneLabel: string
  label: string
  disabled?: boolean
}

type SpeakersState =
  { status: 'loading' } | { status: 'ready'; speakers: Speaker[] } | { status: 'error'; detail: string }

/** VOICEVOX の話者とスタイルから声を選ぶ。話者はエンジンから読み、つながらなければ再接続できる */
export function VoiceSelect({ voice, onChange, noneLabel, label, disabled = false }: Props) {
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

  const select = (styleId: number | null) => {
    if (styleId === null || state.status !== 'ready') return onChange(null)
    for (const sp of state.speakers) {
      const style = sp.styles.find((s) => s.id === styleId)
      if (style) return onChange({ styleId, speakerName: sp.name, styleName: style.name })
    }
  }

  const known = state.status === 'ready' && state.speakers.some((sp) => sp.styles.some((s) => s.id === voice?.styleId))
  // 一覧では話者名を見出しに出し、項目はスタイル名だけにする。閉じたボタンには両方を出す
  const items: DropdownItem<number | null>[] = [
    { value: null, label: state.status === 'loading' ? '話者を読み込み中…' : noneLabel },
    // エンジンにない声（別のエンジンで選んだなど）も、今の値として出しておく
    ...(voice && !known ? [{ value: voice.styleId, label: `${voice.speakerName}（${voice.styleName}）` }] : []),
    ...(state.status === 'ready'
      ? state.speakers.flatMap((sp) =>
          sp.styles.map((s) => ({
            value: s.id,
            label: s.name,
            buttonLabel: `${sp.name}（${s.name}）`,
            group: sp.name,
          })),
        )
      : []),
  ]

  return (
    <>
      <Dropdown
        label={label}
        items={items}
        value={voice?.styleId ?? null}
        disabled={disabled || state.status !== 'ready'}
        onChange={select}
      />
      {state.status === 'error' && (
        <div className="notice error">
          <p>VOICEVOX に接続できません</p>
          <p className="detail">{state.detail}</p>
          <button type="button" onClick={retry}>
            再接続
          </button>
        </div>
      )}
    </>
  )
}
