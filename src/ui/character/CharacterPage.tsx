import { useMemo, useState } from 'react'
import { applyMouth, resolveMouthLayer } from '../../core/character/mouth'
import { VOWELS } from '../../core/character/types'
import type { Character, Expression, Vowel } from '../../core/character/types'
import { initialVisibility, setVisible } from '../../core/psd/visibility'
import type { LayerNode, VisibilityState } from '../../core/psd/types'
import { useApp } from '../useApp'
import { afterPaint, cachePsd, forgetPsd, parsePsd, usePsd } from '../usePsd'
import type { PsdSize } from '../usePsd'
import { ExpressionPanel } from './ExpressionPanel'
import { InlineName } from './InlineName'
import { LayerTree } from './LayerTree'
import { VOWEL_LABELS } from './labels'
import { MouthPanel } from './MouthPanel'
import { Preview } from './Preview'
import { VoicePanel } from './VoicePanel'
import { newId } from '../../core/id'

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
                    setRenamingId(null)
                    void save({ ...c, name })
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <button type="button" className="character-name" onClick={() => setSelectedId(c.id)}>
                  {c.name}
                </button>
              )}
              <span className="row-actions">
                <button type="button" onClick={() => setRenamingId(c.id)}>
                  名前
                </button>
                <button type="button" className="danger" onClick={() => void remove(c)}>
                  削除
                </button>
              </span>
            </li>
          ))}
        </ul>
        <label className={`button primary${adding ? ' disabled' : ''}`}>
          {adding ? 'PSD を読み込み中…' : '＋ PSD からキャラを追加'}
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
  /** 中央で確認する母音。null ならツリーの状態のまま */
  const [previewVowel, setPreviewVowel] = useState<Vowel | null>(null)
  const [playbackVowel, setPlaybackVowel] = useState<Vowel | null>(null)

  const shownVowel = playbackVowel ?? previewVowel
  const previewVisibility = useMemo(
    () =>
      shownVowel === null
        ? visibility
        : applyMouth(tree, visibility, character.mouthGroupId, resolveMouthLayer(character.mouthMap, shownVowel)),
    [tree, visibility, shownVowel, character.mouthGroupId, character.mouthMap],
  )

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
          onToggle={(id, visible) => setVisibility((v) => setVisible(tree, v, id, visible))}
        />
      </section>
      <section className="column preview-column">
        <div className="vowel-switch" role="group" aria-label="プレビューの口">
          <button
            type="button"
            className={previewVowel === null ? 'active' : undefined}
            onClick={() => setPreviewVowel(null)}
          >
            ツリーのまま
          </button>
          {VOWELS.map((v) => (
            <button
              key={v}
              type="button"
              className={previewVowel === v ? 'active' : undefined}
              disabled={character.mouthGroupId === null}
              onClick={() => setPreviewVowel(v)}
            >
              {VOWEL_LABELS[v]}
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
          onChange={(patch) => onSave({ ...character, ...patch })}
          onPlaybackMouth={setPlaybackVowel}
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
