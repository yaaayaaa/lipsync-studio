import type { Character, ScriptLine } from '../../core/character/types'
import { GroupPicker } from '../GroupPicker'

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

/** キャラとスタイルをまとめて選ぶ欄（1行編集の「その他」）。スタイルはキャラごとに畳む */
export function StylePicker({ line, characters, disabled, onChange }: Props) {
  return (
    <GroupPicker
      label="キャラ・スタイル"
      current={currentLabel(line, characters)}
      groups={characters.map((c) => ({ id: c.id, name: c.name, items: c.expressions }))}
      selected={line.characterId && line.expressionId ? { groupId: line.characterId, itemId: line.expressionId } : null}
      onChoose={({ groupId, itemId }) => onChange({ characterId: groupId, expressionId: itemId })}
      disabled={disabled}
      emptyHint="キャラ設定でキャラを追加してください"
    />
  )
}
