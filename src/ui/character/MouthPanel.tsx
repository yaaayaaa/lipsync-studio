import { useEffect, useRef, useState } from 'react'
import { VOWELS } from '../../core/character/types'
import type { Character, MouthMap, Vowel } from '../../core/character/types'
import { buildMouthTimeline, mouthAt } from '../../core/lipsync/timeline'
import { findNode } from '../../core/psd/layerTree'
import type { LayerId, LayerNode } from '../../core/psd/types'
import { prepareQuery } from '../../core/voicevox/client'
import { useApp } from '../useApp'
import { VOWEL_LABELS } from './labels'

const SAMPLE_TEXT = 'あいうえお'

interface Props {
  tree: LayerNode[]
  character: Character
  onChange(patch: { mouthGroupId: LayerId | null; mouthMap: MouthMap }): void
  /** 再生中は口の母音、終わったら null */
  onPlaybackMouth(vowel: Vowel | null): void
}

interface GroupOption {
  id: LayerId
  label: string
}

/** flip を除いた全グループを、親からのパス付きの名前で上から順に並べる。 */
function groupOptions(nodes: LayerNode[], prefix = ''): GroupOption[] {
  return [...nodes]
    .reverse()
    .filter((n) => n.isGroup && !n.flip)
    .flatMap((n) => {
      const label = prefix + n.name
      return [{ id: n.id, label }, ...groupOptions(n.children, `${label}/`)]
    })
}

function assign(map: MouthMap, vowel: Vowel, layerId: LayerId | null): MouthMap {
  const next = { ...map }
  if (layerId === null) delete next[vowel]
  else next[vowel] = layerId
  return next
}

export function MouthPanel({ tree, character, onChange, onPlaybackMouth }: Props) {
  const { mouthGroupId, mouthMap, voice } = character
  const mouthGroup = mouthGroupId === null ? undefined : findNode(tree, mouthGroupId)
  const mouthOptions = mouthGroup ? [...mouthGroup.children].reverse().filter((n) => !n.flip) : []

  return (
    <section className="panel">
      <h2>口</h2>
      <label className="field">
        <span>口グループ</span>
        <select
          value={mouthGroup ? mouthGroup.id : ''}
          // グループを変えたら、前のグループの子を指す割り当ては意味を失うので消す
          onChange={(e) => onChange({ mouthGroupId: e.target.value || null, mouthMap: {} })}
        >
          <option value="">未設定</option>
          {groupOptions(tree).map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      {mouthGroupId !== null && !mouthGroup && (
        <p className="notice error">設定された口グループが PSD に見つかりません。選び直してください。</p>
      )}
      <div className="vowel-grid">
        {VOWELS.map((v) => (
          <label key={v} className="field">
            <span>{VOWEL_LABELS[v]}</span>
            <select
              value={mouthMap[v] ?? ''}
              disabled={!mouthGroup}
              aria-label={`${VOWEL_LABELS[v]}の口`}
              onChange={(e) => onChange({ mouthGroupId, mouthMap: assign(mouthMap, v, e.target.value || null) })}
            >
              <option value="">未設定</option>
              {mouthOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="hint">未設定の母音は「閉じ」の口を使います。</p>
      <SamplePlayer
        styleId={voice?.styleId ?? null}
        disabledReason={!voice ? '先に声を選んでください' : !mouthGroup ? '先に口グループを選んでください' : null}
        onPlaybackMouth={onPlaybackMouth}
      />
    </section>
  )
}

interface PlayerProps {
  styleId: number | null
  disabledReason: string | null
  onPlaybackMouth(vowel: Vowel | null): void
}

/** 「あいうえお」を合成して再生し、再生位置に合わせて口を動かす。 */
function SamplePlayer({ styleId, disabledReason, onPlaybackMouth }: PlayerProps) {
  const { client } = useApp()
  const [status, setStatus] = useState<'idle' | 'synthesizing' | 'playing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  // 画面を離れたら再生を止める
  useEffect(() => () => stopRef.current?.(), [])

  const play = async () => {
    if (styleId === null) return
    stopRef.current?.()
    setError(null)
    setStatus('synthesizing')
    try {
      const query = prepareQuery(await client.audioQuery(SAMPLE_TEXT, styleId), 1.0)
      const wav = await client.synthesis(query, styleId)
      const timeline = buildMouthTimeline(query)
      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
      const audio = new Audio(url)
      let frame = 0
      const stop = () => {
        cancelAnimationFrame(frame)
        audio.pause()
        URL.revokeObjectURL(url)
        stopRef.current = null
        onPlaybackMouth(null)
        setStatus('idle')
      }
      const tick = () => {
        onPlaybackMouth(mouthAt(timeline, audio.currentTime))
        frame = requestAnimationFrame(tick)
      }
      audio.addEventListener('ended', stop)
      stopRef.current = stop
      await audio.play()
      setStatus('playing')
      tick()
    } catch (e) {
      stopRef.current?.()
      setStatus('idle')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="sample-player">
      <button
        type="button"
        className="primary"
        onClick={status === 'playing' ? () => stopRef.current?.() : play}
        disabled={disabledReason !== null || status === 'synthesizing'}
        title={disabledReason ?? undefined}
      >
        {status === 'synthesizing' ? '合成中…' : status === 'playing' ? '停止' : '「あいうえお」を再生'}
      </button>
      {disabledReason && <p className="hint">{disabledReason}</p>}
      {error && <p className="notice error">再生できませんでした: {error}</p>}
    </div>
  )
}
