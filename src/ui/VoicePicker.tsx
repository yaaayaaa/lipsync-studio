import { useEffect, useState } from 'react'
import type { VoiceRef } from '../core/character/types'
import type { Speaker } from '../core/voicevox/types'
import { GroupPicker } from './GroupPicker'
import { useApp } from './useApp'

interface Props {
  voice: VoiceRef | null
  onChange(voice: VoiceRef | null): void
  /** 声を選ばない（null）ときの名前。キャラ設定では「未設定」、1行編集では「キャラの声（…）」 */
  noneLabel: string
  /** 閉じた欄に添える名前。ほかの選択欄と並ぶ1行編集で使う */
  caption?: string
  disabled?: boolean
}

type SpeakersState =
  { status: 'loading' } | { status: 'ready'; speakers: Speaker[] } | { status: 'error'; detail: string }

/**
 * VOICEVOX の話者とスタイルから声を選ぶ。スタイルは話者ごとに畳む。
 * 話者はエンジンから読み、つながらなければ再接続できる
 */
export function VoicePicker({ voice, onChange, noneLabel, caption, disabled = false }: Props) {
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

  const speakers = state.status === 'ready' ? state.speakers : []
  // 同じ名前の話者が別のエンジンにいても分かれるよう、見出しは uuid と名前で区別する
  const groupIdOf = (sp: Speaker) => `${sp.speaker_uuid}:${sp.name}`
  const owner = voice ? speakers.find((sp) => sp.styles.some((s) => s.id === voice.styleId)) : undefined

  const choose = (groupId: string, itemId: string) => {
    const sp = speakers.find((x) => groupIdOf(x) === groupId)
    const style = sp?.styles.find((s) => String(s.id) === itemId)
    if (sp && style) onChange({ styleId: style.id, speakerName: sp.name, styleName: style.name })
  }

  return (
    <>
      <GroupPicker
        label="声"
        caption={caption}
        // エンジンにない声（別のエンジンで選んだなど）も、覚えている名前で出す
        current={
          state.status === 'loading'
            ? '話者を読み込み中…'
            : voice
              ? `${voice.speakerName}（${voice.styleName}）`
              : noneLabel
        }
        groups={speakers.map((sp) => ({
          id: groupIdOf(sp),
          name: sp.name,
          items: sp.styles.map((s) => ({ id: String(s.id), name: s.name })),
        }))}
        selected={voice && owner ? { groupId: groupIdOf(owner), itemId: String(voice.styleId) } : null}
        onChoose={({ groupId, itemId }) => choose(groupId, itemId)}
        none={{ label: noneLabel, selected: voice === null, onChoose: () => onChange(null) }}
        disabled={disabled || state.status !== 'ready'}
        emptyHint="話者が見つかりません"
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
