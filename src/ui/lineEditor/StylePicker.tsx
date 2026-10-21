import { useId, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { iconProps } from '../icons'
import type { Character, ScriptLine } from '../../core/character/types'
import { searchStyles } from './styleSearch'

interface Props {
  line: ScriptLine
  characters: Character[]
  disabled: boolean
  onChange(patch: Pick<ScriptLine, 'characterId' | 'expressionId'>): void
}

/** 閉じているときの表示。消されたキャラ・スタイルを指していたらそう出す */
function currentLabel(line: ScriptLine, characters: Character[]): string {
  if (!line.characterId) return 'キャラ・スタイルを選択'
  const character = characters.find((c) => c.id === line.characterId)
  if (!character) return '（削除されたキャラ）'
  const expression = character.expressions.find((e) => e.id === line.expressionId)
  return `${character.name}・${expression ? expression.name : line.expressionId ? '（削除されたスタイル）' : 'スタイルを選択'}`
}

/**
 * キャラとスタイルをまとめて選ぶ欄（1行編集の「その他」）。ふだんは今の選択だけを出して閉じておき、
 * 押すと開いて、上の検索窓で絞り込みながらスタイルを選ぶ。選んだら閉じる。
 * キャラが多いと長くなるので、スタイルはキャラごとに畳む。開いたときは今のキャラだけを開き、
 * 検索中は当たったキャラをすべて開いて見せる
 */
export function StylePicker({ line, characters, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // スタイルを開いて見せているキャラ
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const listId = useId()
  // 書き出しで止まったら閉じる
  if (open && disabled) setOpen(false)

  const groups = searchStyles(characters, query)
  const searching = query.trim() !== ''
  const show = () => {
    setExpanded(new Set(line.characterId ? [line.characterId] : []))
    setOpen(true)
  }
  const toggleCharacter = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const choose = (characterId: string, expressionId: string) => {
    onChange({ characterId, expressionId })
    close()
  }

  return (
    <div className="style-picker">
      <button
        type="button"
        className="style-picker-toggle"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
      >
        <span className="style-picker-current">{currentLabel(line, characters)}</span>
        <ChevronDown {...iconProps} className="style-picker-chevron" />
      </button>
      {open && (
        <div id={listId} className="style-picker-body">
          <label className="style-picker-search">
            <Search {...iconProps} />
            <input
              type="search"
              value={query}
              placeholder="検索"
              aria-label="キャラ・スタイルを検索"
              // 開いたらすぐ打てるように
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // 検索中の Enter で一番上の候補を選ぶ。Esc は、文字があればブラウザがまず文字を消すので、空のときに閉じる
                const first = groups[0]
                if (e.key === 'Enter' && searching && first) choose(first.character.id, first.expressions[0].id)
                if (e.key === 'Escape' && query === '') close()
              }}
            />
          </label>
          {groups.length === 0 ? (
            <p className="hint">
              {characters.length === 0 ? 'キャラ設定でキャラを追加してください' : '見つかりません'}
            </p>
          ) : (
            groups.map(({ character, expressions }) => {
              const unfolded = searching || expanded.has(character.id)
              const groupId = `${listId}-${character.id}`
              return (
                <div key={character.id} className="style-picker-group">
                  <button
                    type="button"
                    className="style-picker-character"
                    aria-expanded={unfolded}
                    aria-controls={groupId}
                    // 検索中は当たったものを全部見せるので畳めない
                    disabled={searching}
                    onClick={() => toggleCharacter(character.id)}
                  >
                    <ChevronRight {...iconProps} size={14} className="style-picker-chevron" />
                    <span className="style-picker-character-name">{character.name}</span>
                    <span className="style-picker-count">{expressions.length}</span>
                  </button>
                  {unfolded && (
                    <div id={groupId} role="group" aria-label={character.name}>
                      {expressions.map((e) => {
                        const selected = line.characterId === character.id && line.expressionId === e.id
                        return (
                          <button
                            key={e.id}
                            type="button"
                            className={selected ? 'style-picker-option selected' : 'style-picker-option'}
                            aria-pressed={selected}
                            onClick={() => choose(character.id, e.id)}
                          >
                            {e.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
