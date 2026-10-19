import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { iconProps } from '../icons'
import { applyMouth, resolveMouthLayer } from '../../core/character/mouth'
import type { Character, Expression, Vowel } from '../../core/character/types'
import { initialVisibility, setVisible } from '../../core/psd/visibility'
import type { LayerId, LayerNode, VisibilityState } from '../../core/psd/types'
import { useApp } from '../useApp'
import { afterPaint, cachePsd, forgetPsd, parsePsd, usePsd } from '../usePsd'
import type { PsdSize } from '../usePsd'
import { ExpressionPanel } from './ExpressionPanel'
import { InlineName } from './InlineName'
import { LayerTree } from './LayerTree'
import { VOWEL_LABELS } from './labels'
import { MouthPanel } from './MouthPanel'
import { Preview } from './Preview'
import { RowMenu } from './RowMenu'
import { useRefocus } from './useRefocus'
import { DEFAULT_PREVIEW_MODE, PREVIEW_MODES, previewModeAfter, previewMouthLayer } from './previewMode'
import type { LiveMouth, PreviewEvent, PreviewMode } from './previewMode'
import { VoicePanel } from './VoicePanel'
import { newId } from '../../core/id'

const characterNameId = (id: string) => `character-name-${id}`

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function CharacterPage() {
  const { characters, store, saveCharacter, reloadCharacters } = useApp()
  const [selectedId, setSelectedId] = useState<string | null>(characters[0]?.id ?? null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = characters.find((c) => c.id === selectedId) ?? null
  const refocus = useRefocus()
  const endRename = (id: string) => {
    setRenamingId(null)
    refocus(characterNameId(id))
  }

  const save = (c: Character, psd?: Blob) =>
    saveCharacter(c, psd).catch((e: unknown) => setError(`保存できませんでした: ${errorMessage(e)}`))

  const add = async (file: File) => {
    setError(null)
    setAdding(true)
    try {
      const buffer = await file.arrayBuffer()
      await afterPaint()
      let parsed
      try {
        parsed = parsePsd(buffer)
      } catch (e) {
        setError(`PSD を読み込めませんでした: ${errorMessage(e)}`)
        return
      }
      const character: Character = {
        id: newId(),
        name: file.name.replace(/\.psd$/i, ''),
        psdFileName: file.name,
        voice: null,
        mouthGroupId: null,
        mouthMap: {},
        expressions: [],
      }
      cachePsd(character.id, parsed)
      await saveCharacter(character, new Blob([buffer], { type: file.type }))
      setSelectedId(character.id)
    } catch (e) {
      setError(`キャラを追加できませんでした: ${errorMessage(e)}`)
    } finally {
      setAdding(false)
    }
  }

  const remove = async (c: Character) => {
    if (!confirm(`キャラ「${c.name}」を削除しますか？ PSD と表情も消えます。`)) return
    try {
      await store.deleteCharacter(c.id)
      forgetPsd(c.id)
      if (selectedId === c.id) setSelectedId(characters.find((x) => x.id !== c.id)?.id ?? null)
    } catch (e) {
      setError(`削除できませんでした: ${errorMessage(e)}`)
    } finally {
      await reloadCharacters()
    }
  }

  return (
    <div className="character-page">
      <aside className="column character-list">
        <h2>キャラ</h2>
        <ul>
          {characters.map((c) => (
            <li key={c.id} className={c.id === selectedId ? 'selected' : undefined}>
              {renamingId === c.id ? (
                <InlineName
                  name={c.name}
                  onRename={(name) => {
                    endRename(c.id)
                    void save({ ...c, name })
                  }}
                  onCancel={() => endRename(c.id)}
                />
              ) : (
                <button
                  type="button"
                  id={characterNameId(c.id)}
                  className="character-name"
                  title={`${c.name} — ダブルクリックで名前を変更`}
                  onClick={() => setSelectedId(c.id)}
                  onDoubleClick={() => setRenamingId(c.id)}
                >
                  {c.name}
                </button>
              )}
              {renamingId !== c.id && (
                <RowMenu
                  label="キャラの操作"
                  items={[
                    { label: '名前を変更', icon: Pencil, onSelect: () => setRenamingId(c.id) },
                    { label: '削除', icon: Trash2, danger: true, onSelect: () => void remove(c) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
        <label className={`button primary${adding ? ' disabled' : ''}`}>
          {adding ? (
            'PSD を読み込み中…'
          ) : (
            <>
              <Plus {...iconProps} />
              PSD からキャラを追加
            </>
          )}
          <input
            type="file"
            accept=".psd"
            hidden
            disabled={adding}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void add(file)
            }}
          />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </aside>
      {selected ? (
        <CharacterEditor key={selected.id} character={selected} onSave={save} />
      ) : (
        <div className="empty-state">
          <p>PSD を選んでキャラを追加してください。</p>
        </div>
      )}
    </div>
  )
}

interface EditorProps {
  character: Character
  onSave(c: Character): void
}

function CharacterEditor({ character, onSave }: EditorProps) {
  const psd = usePsd(character.id)
  if (psd.status === 'loading') return <div className="empty-state">PSD を読み込み中…</div>
  if (psd.status === 'error') {
    return <div className="empty-state notice error">PSD を読み込めませんでした: {psd.error}</div>
  }
  return <ReadyEditor character={character} onSave={onSave} tree={psd.tree} psdSize={psd.psdSize} />
}

function ReadyEditor({ character, onSave, tree, psdSize }: EditorProps & { tree: LayerNode[]; psdSize: PsdSize }) {
  // 最初は先頭の表情（なければ PSD の初期状態）をツリーに読み込む
  const [visibility, setVisibility] = useState<VisibilityState>(
    () => character.expressions[0]?.visibility ?? initialVisibility(tree),
  )
  const [expressionId, setExpressionId] = useState<string | null>(character.expressions[0]?.id ?? null)
  /** 中央で確認する母音。口の編集に合わせて自動でも切り替わる */
  const [previewMode, setPreviewMode] = useState<PreviewMode>(DEFAULT_PREVIEW_MODE)
  const [playbackVowel, setPlaybackVowel] = useState<Vowel | null>(null)
  const live = useLiveMouth()
  const follow = (event: PreviewEvent) => setPreviewMode(previewModeAfter(event))

  const previewVisibility = useMemo(() => {
    const { mouthGroupId, mouthMap } = character
    if (playbackVowel !== null) {
      return applyMouth(tree, visibility, mouthGroupId, resolveMouthLayer(mouthMap, playbackVowel))
    }
    return applyMouth(tree, visibility, mouthGroupId, previewMouthLayer(mouthMap, previewMode, live.value))
  }, [tree, visibility, playbackVowel, previewMode, live.value, character])

  const selectExpression = (e: Expression) => {
    setVisibility(e.visibility)
    setExpressionId(e.id)
  }

  return (
    <>
      <section className="column tree-column">
        <h2>レイヤー</h2>
        <LayerTree
          tree={tree}
          visibility={visibility}
          mouthGroupId={character.mouthGroupId}
          psdSize={psdSize}
          onToggle={(id, visible) => {
            setVisibility((v) => setVisible(tree, v, id, visible))
            follow({ type: 'treeToggled' })
          }}
        />
      </section>
      <section className="column preview-column">
        <div className="vowel-switch" role="group" aria-label="プレビューの口">
          {PREVIEW_MODES.map((v) => (
            <button
              key={v}
              type="button"
              className={previewMode === v ? 'active' : undefined}
              aria-pressed={previewMode === v}
              disabled={character.mouthGroupId === null}
              onClick={() => follow({ type: 'manual', mode: v })}
            >
              {v === DEFAULT_PREVIEW_MODE ? 'デフォルト' : VOWEL_LABELS[v]}
            </button>
          ))}
        </div>
        <div className="preview-stage">
          <Preview tree={tree} visibility={previewVisibility} psdSize={psdSize} />
        </div>
        <p className="hint">
          {psdSize.width}×{psdSize.height}・{character.psdFileName}
          {playbackVowel !== null && `・再生中（${VOWEL_LABELS[playbackVowel]}）`}
        </p>
      </section>
      <section className="column panel-column">
        <VoicePanel voice={character.voice} onChange={(voice) => onSave({ ...character, voice })} />
        <MouthPanel
          tree={tree}
          character={character}
          visibility={visibility}
          psdSize={psdSize}
          onChange={(patch) => {
            onSave({ ...character, ...patch })
            if (patch.mouthGroupId !== character.mouthGroupId) follow({ type: 'groupChanged', ...patch })
          }}
          onPlaybackMouth={setPlaybackVowel}
          onVowelOpen={(vowel) => follow({ type: 'vowelOpened', vowel })}
          onLiveMouth={live.set}
        />
        <ExpressionPanel
          tree={tree}
          expressions={character.expressions}
          selectedId={expressionId}
          visibility={visibility}
          onChange={(expressions) => onSave({ ...character, expressions })}
          onSelect={selectExpression}
        />
      </section>
    </>
  )
}

/**
 * 母音のドロップダウンで強調中の口（保存前の試し見せ）。矢印キーで選択肢を素早く動かしても
 * プレビューの合成が追いつくよう、反映は1フレームに1回にまとめる。閉じたときはすぐ消す。
 */
function useLiveMouth(): { value: LiveMouth | null; set(vowel: Vowel, layerId: LayerId | null | undefined): void } {
  const [value, setValue] = useState<LiveMouth | null>(null)
  const pending = useRef<LiveMouth | null>(null)
  const frame = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const set = (vowel: Vowel, layerId: LayerId | null | undefined) => {
    if (layerId === undefined) {
      // 閉じた母音のものだけ消す（別の母音を開いた直後の知らせを消さない）
      if (pending.current?.vowel === vowel) {
        cancelAnimationFrame(frame.current)
        frame.current = 0
        pending.current = null
      }
      setValue((cur) => (cur?.vowel === vowel ? null : cur))
      return
    }
    pending.current = { vowel, layerId }
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      setValue(pending.current)
    })
  }
  return { value, set }
}
