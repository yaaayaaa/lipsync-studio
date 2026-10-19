import { useEffect, useRef, useState } from 'react'
import { VOWELS } from '../../core/character/types'
import type { Character, MouthMap, Vowel } from '../../core/character/types'
import { buildMouthTimeline } from '../../core/lipsync/timeline'
import { findNode } from '../../core/psd/layerTree'
import type { LayerId, LayerNode, VisibilityState } from '../../core/psd/types'
import { prepareQuery } from '../../core/voicevox/client'
import { useApp } from '../useApp'
import type { PsdSize } from '../usePsd'
import { LayerThumb } from './LayerThumb'
import { MouthSelect } from './MouthSelect'
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
}

interface GroupOption {
  node: LayerNode
  /** 親からのパス付きの名前 */
  label: string
}

/** flip を除いた全グループを、親からのパス付きの名前で上から順に並べる。 */
function groupOptions(nodes: LayerNode[], prefix = ''): GroupOption[] {
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

export function MouthPanel({ tree, character, visibility, psdSize, onChange, onPlaybackMouth }: Props) {
  const { mouthGroupId, mouthMap, voice } = character
  const mouthGroup = mouthGroupId === null ? undefined : findNode(tree, mouthGroupId)
  const mouthOptions = mouthGroup ? [...mouthGroup.children].reverse().filter((n) => !n.flip) : []
  const thumb = { visibility, psdSize }
  /** 開いている母音のドロップダウン（同時に1つだけ） */
  const [openVowel, setOpenVowel] = useState<Vowel | null>(null)

  const chooseGroup = (id: LayerId | null) => {
    // 同じグループを押し直しただけで割り当てを消さない
    if (id === (mouthGroup ? mouthGroup.id : null)) return
    // グループを変えたら、前のグループの子を指す割り当ては意味を失うので消す
    onChange({ mouthGroupId: id, mouthMap: {} })
  }

  return (
    <section className="panel">
      <h2>口</h2>
      <div className="picker-field">
        <span id="mouth-group-label">口グループ</span>
        <div className="tile-picker group-picker" role="group" aria-labelledby="mouth-group-label">
          <Tile name="未設定" node={null} selected={!mouthGroup} onClick={() => chooseGroup(null)} {...thumb} />
          {groupOptions(tree).map((g) => (
            <Tile
              key={g.node.id}
              name={g.node.name}
              title={g.label}
              node={g.node}
              selected={g.node.id === mouthGroup?.id}
              onClick={() => chooseGroup(g.node.id)}
              {...thumb}
            />
          ))}
        </div>
      </div>
      {mouthGroupId !== null && !mouthGroup && (
        <p className="notice error">設定された口グループが PSD に見つかりません。選び直してください。</p>
      )}
      {mouthGroup ? (
        <div className="vowel-grid">
          {VOWELS.map((v) => (
            <div key={v} className="field">
              <span aria-hidden>{VOWEL_LABELS[v]}</span>
              <MouthSelect
                label={`${VOWEL_LABELS[v]}の口`}
                options={mouthOptions}
                value={mouthMap[v] ?? null}
                open={openVowel === v}
                onOpenChange={(open) => setOpenVowel(open ? v : null)}
                onChange={(id) => onChange({ mouthGroupId, mouthMap: assign(mouthMap, v, id) })}
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

interface TileProps {
  name: string
  /** ボタンにかざしたときの説明（パス付きの名前など）。なければ name */
  title?: string
  node: LayerNode | null
  selected: boolean
  visibility: VisibilityState
  psdSize: PsdSize
  onClick(): void
}

/** サムネイルと名前の選択肢。選択中は枠を太くし、名前を反転させる。 */
function Tile({ name, title, node, selected, visibility, psdSize, onClick }: TileProps) {
  return (
    <button
      type="button"
      className={`tile${selected ? ' selected' : ''}`}
      aria-pressed={selected}
      title={title ?? name}
      onClick={onClick}
    >
      <LayerThumb node={node} visibility={visibility} psdSize={psdSize} />
      <span className="tile-name">{name}</span>
    </button>
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
