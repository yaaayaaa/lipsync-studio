import { SlidersHorizontal } from 'lucide-react'
import { iconProps } from '../icons'
import type { Character, ScriptLine } from '../../core/character/types'
import { applyTextChange } from './lineText'

// 「セリフ」の一覧と1行編集の両方で、同じ行の文・キャラ・スタイルを同じ規則で編集する。

interface TextProps {
  line: ScriptLine
  disabled: boolean
  label: string
  rows?: number
  onEdit(fn: (line: ScriptLine) => ScriptLine): void
}

/** セリフの文の欄。この欄は複数行なので Enter は改行のまま */
export function LineTextArea({ line, disabled, label, rows = 2, onEdit }: TextProps) {
  return (
    <textarea
      className="line-text"
      rows={rows}
      value={line.text}
      placeholder="セリフを入力"
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const text = e.target.value
        onEdit((current) => applyTextChange(current, text))
      }}
    />
  )
}

interface SelectProps {
  line: ScriptLine
  characters: Character[]
  disabled: boolean
  onChange(patch: Partial<Pick<ScriptLine, 'characterId' | 'expressionId'>>): void
}

/** キャラとスタイルの選択。キャラを変えたら、そのキャラの最初のスタイルにする */
export function LineCharacterSelects({ line, characters, disabled, onChange }: SelectProps) {
  const character = characters.find((c) => c.id === line.characterId)
  const expressionKnown = character?.expressions.some((e) => e.id === line.expressionId) ?? false

  const selectCharacter = (id: string) => {
    const next = characters.find((c) => c.id === id)
    onChange({ characterId: next?.id ?? null, expressionId: next?.expressions[0]?.id ?? null })
  }

  return (
    <>
      <select
        value={character ? character.id : ''}
        disabled={disabled}
        aria-label="キャラ"
        onChange={(e) => selectCharacter(e.target.value)}
      >
        <option value="">{line.characterId && !character ? '（削除されたキャラ）' : 'キャラを選択'}</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={expressionKnown ? (line.expressionId ?? '') : ''}
        disabled={disabled || !character}
        aria-label="スタイル"
        onChange={(e) => onChange({ expressionId: e.target.value || null })}
      >
        <option value="">
          {line.expressionId && character && !expressionKnown ? '（削除されたスタイル）' : 'スタイルを選択'}
        </option>
        {character?.expressions.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </>
  )
}

/** 作り込み済みの行の印。押しても何も起きない */
export function TunedMark() {
  return (
    <span className="line-tuned" role="img" aria-label="作り込み済み" title="作り込み済み">
      <SlidersHorizontal {...iconProps} />
    </span>
  )
}
