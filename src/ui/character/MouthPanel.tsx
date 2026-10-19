import { useEffect, useRef, useState } from 'react'
import { VOWELS } from '../../core/character/types'
import type { Character, MouthMap, Vowel } from '../../core/character/types'
import { buildMouthTimeline } from '../../core/lipsync/timeline'
import { findNode } from '../../core/psd/layerTree'
import type { LayerId, LayerNode, VisibilityState } from '../../core/psd/types'
import { prepareQuery } from '../../core/voicevox/client'
import { useApp } from '../useApp'
import type { PsdSize } from '../usePsd'
import { LayerSelect } from './LayerSelect'
import { groupChoicePatch } from './mouthGroup'
import type { LayerOption } from './LayerSelect'
import { VOWEL_LABELS } from './labels'
import { browserPlaybackEnv, startSamplePlayback } from './samplePlayback'
import type { PlaybackHandle } from './samplePlayback'

const SAMPLE_TEXT = 'あいうえお'

interface Props {
  tree: LayerNode[]
  character: Character
  /** ツリーの表示状態（グループのサムネイルに使う） */
  visibility: VisibilityState
  psdSize: PsdSize
  onChange(patch: { mouthGroupId: LayerId | null; mouthMap: MouthMap }): void
  /** 再生中は口の母音、終わったら null */
  onPlaybackMouth(vowel: Vowel | null): void
  /** 母音のドロップダウンを開いた */
  onVowelOpen(vowel: Vowel): void
  /** 開いている母音のドロップダウンで強調中の口（null は「未設定」）。閉じたら undefined */
  onLiveMouth(vowel: Vowel, layerId: LayerId | null | undefined): void
}

/** flip を除いた全グループを、親からのパス付きの名前で上から順に並べる。 */
function groupOptions(nodes: LayerNode[], prefix = ''): LayerOption[] {
  return [...nodes]
    .reverse()
    .filter((n) => n.isGroup && !n.flip)
    .flatMap((n) => {
      const label = prefix + n.name
      return [{ node: n, label }, ...groupOptions(n.children, `${label}/`)]
    })
}

function assign(map: MouthMap, vowel: Vowel, layerId: LayerId | null): MouthMap {
  const next = { ...map }
  if (layerId === null) delete next[vowel]
  else next[vowel] = layerId
  return next
}

export function MouthPanel({
  tree,
  character,
  visibility,
  psdSize,
  onChange,
  onPlaybackMouth,
  onVowelOpen,
  onLiveMouth,
}: Props) {
  const { mouthGroupId, mouthMap, voice } = character
  const mouthGroup = mouthGroupId === null ? undefined : findNode(tree, mouthGroupId)
  const mouthOptions = mouthGroup
    ? [...mouthGroup.children]
        .reverse()
        .filter((n) => !n.flip)
        .map((n) => ({ node: n, label: n.name }))
    : []
  const thumb = { visibility, psdSize }
  /** 開いているドロップダウン（同時に1つだけ） */
  const [openSelect, setOpenSelect] = useState<Vowel | 'group' | null>(null)
  const openProps = (key: Vowel | 'group') => ({
    open: openSelect === key,
    onOpenChange: (open: boolean) => {
      // 閉じる知らせが、すでに開いた別のドロップダウンを閉じないようにする
      setOpenSelect((cur) => (open ? key : cur === key ? null : cur))
      if (open && key !== 'group') onVowelOpen(key)
    },
  })

  const chooseGroup = (id: LayerId | null) => {
    const patch = groupChoicePatch(mouthGroupId, id)
    if (patch) onChange(patch)
  }

  return (
    <section className="panel">
      <h2>口</h2>
      <div className="mouth-group-field">
        <span aria-hidden>口グループ</span>
        <LayerSelect
          label="口グループ"
          options={groupOptions(tree)}
          value={mouthGroup ? mouthGroup.id : null}
          onChange={chooseGroup}
          {...openProps('group')}
          {...thumb}
        />
      </div>
      {mouthGroupId !== null && !mouthGroup && (
        <p className="notice error">設定された口グループが PSD に見つかりません。選び直してください。</p>
      )}
      {mouthGroup ? (
        <div className="vowel-grid">
          {VOWELS.map((v) => (
            <div key={v} className="field">
              <span aria-hidden>{VOWEL_LABELS[v]}</span>
              <LayerSelect
                label={`${VOWEL_LABELS[v]}の口`}
                options={mouthOptions}
                value={mouthMap[v] ?? null}
                {...openProps(v)}
                onChange={(id) => onChange({ mouthGroupId, mouthMap: assign(mouthMap, v, id) })}
                onActiveChange={(id) => onLiveMouth(v, id)}
                {...thumb}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">口グループを選ぶと、母音ごとに口を選べます。</p>
      )}
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
  // 進行中の再生。画面を離れたら null にしてから取り消し、終わった再生が状態を触らないようにする
  const handleRef = useRef<PlaybackHandle | null>(null)

  useEffect(
    () => () => {
      const handle = handleRef.current
      handleRef.current = null
      handle?.cancel()
    },
    [],
  )

  const stop = () => handleRef.current?.cancel()

  const play = () => {
    if (styleId === null) return
    handleRef.current?.cancel()
    setError(null)
    setStatus('synthesizing')
    const handle = startSamplePlayback(
      async () => {
        const query = prepareQuery(await client.audioQuery(SAMPLE_TEXT, styleId), 1.0)
        const wav = await client.synthesis(query, styleId)
        return { wav, timeline: buildMouthTimeline(query) }
      },
      browserPlaybackEnv,
      { onMouth: onPlaybackMouth, onPlaying: () => setStatus('playing') },
    )
    handleRef.current = handle
    const settle = (message: string | null) => {
      if (handleRef.current !== handle) return
      handleRef.current = null
      onPlaybackMouth(null)
      setStatus('idle')
      setError(message)
    }
    handle.done.then(
      () => settle(null),
      (e: unknown) => settle(e instanceof Error ? e.message : String(e)),
    )
  }

  return (
    <div className="sample-player">
      <button
        type="button"
        className="primary"
        onClick={status === 'playing' ? stop : play}
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
