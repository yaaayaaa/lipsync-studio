import { useState } from 'react'
import { Eraser, SlidersHorizontal, TriangleAlert, Undo2 } from 'lucide-react'
import { iconProps } from '../icons'
import type { Character, ScriptLine } from '../../core/character/types'
import { applyTextChange, dropTuning, hasStaleTuning, restoreTunedText } from './lineText'

const DROP_TUNING_CONFIRM = 'この行の作り込み（アクセント・高さ・長さなど）が消えます。よろしいですか？'

// 「セリフ」の一覧と1行編集の両方で、同じ行の文・キャラ・スタイルを同じ規則で編集する。

interface TextProps {
  line: ScriptLine
  disabled: boolean
  label: string
  rows?: number
  /** 作り込みと文が合っていないときの知らせを1行に詰める（「セリフ」の一覧） */
  compact?: boolean
  /** 今の行から次の行を作る（作り込みを捨てるなど、項目を消す変更に使う） */
  onEdit(fn: (line: ScriptLine) => ScriptLine): void
}

/**
 * セリフの文の欄。作り込みのある行は、文を確定したときに初めて作り込みを捨てる（打ち間違い1つで消さないため）。
 * 確定はフォーカスを外したときだけ。この欄は複数行なので Enter は改行のまま。
 *
 * 確定を通らずに文と作り込みが食い違ったまま残ることがある（打っている途中で再読み込みした・書き出しで欄が
 * 止まって blur が来なかった）。その間は作り込みが使えず行が動かせないので、欄にフォーカスがなければ知らせを出し、
 * 捨てるか文を戻すかをここで選べるようにする
 */
export function LineTextArea({ line, disabled, label, rows = 2, compact = false, onEdit }: TextProps) {
  const [focused, setFocused] = useState(false)
  // 書き出しで欄が止まると、フォーカスが外れても blur が来ないことがある。止まったら外れたものとする
  if (focused && disabled) setFocused(false)

  const commit = () => {
    setFocused(false)
    if (!hasStaleTuning(line)) return
    onEdit(window.confirm(DROP_TUNING_CONFIRM) ? dropTuning : restoreTunedText)
  }
  return (
    <>
      <textarea
        className="line-text"
        rows={rows}
        value={line.text}
        placeholder="セリフを入力"
        disabled={disabled}
        aria-label={label}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const text = e.target.value
          onEdit((current) => applyTextChange(current, text))
        }}
        onBlur={commit}
      />
      {!focused && hasStaleTuning(line) && <StaleTuningNotice compact={compact} disabled={disabled} onEdit={onEdit} />}
    </>
  )
}

/** 作り込みと文が合っていないときの知らせ。どちらのボタンも、確定の確認と同じ変更を行の編集の経路で行う */
function StaleTuningNotice({
  compact,
  disabled,
  onEdit,
}: {
  compact: boolean
  disabled: boolean
  onEdit(fn: (line: ScriptLine) => ScriptLine): void
}) {
  return (
    <div className={compact ? 'stale-tuning compact' : 'stale-tuning'} role="status">
      <span>
        {compact
          ? '作り込みが文と合っていません'
          : '文が作り込みを作ったときと違うため、作り込みを使えません。作り込みを捨てるか、文を戻してください。'}
      </span>
      <span className="stale-tuning-actions">
        <button type="button" disabled={disabled} onClick={() => onEdit(dropTuning)}>
          <Eraser {...iconProps} />
          作り込みを捨てる
        </button>
        <button type="button" disabled={disabled} onClick={() => onEdit(restoreTunedText)}>
          <Undo2 {...iconProps} />
          文を戻す
        </button>
      </span>
    </div>
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

/** 作り込み済みの行の印。押しても何も起きない。stale は作り込みが今の文と合っていない（使えない）とき */
export function TunedMark({ stale = false }: { stale?: boolean }) {
  const label = stale ? '作り込みが文と合っていません' : '作り込み済み'
  return (
    <span className={stale ? 'line-tuned stale' : 'line-tuned'} role="img" aria-label={label} title={label}>
      {stale ? <TriangleAlert {...iconProps} /> : <SlidersHorizontal {...iconProps} />}
    </span>
  )
}
