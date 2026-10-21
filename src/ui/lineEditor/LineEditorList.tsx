import { Plus } from 'lucide-react'
import { iconProps } from '../icons'
import type { ScriptLine } from '../../core/character/types'
import { TunedMark } from '../script/LineFields'
import { hasStaleTuning } from '../script/lineText'

interface Props {
  lines: ScriptLine[]
  selectedId: string | null
  locked: boolean
  onSelect(lineId: string): void
  onAdd(): void
}

/** 行の番号と先頭の文。並べ替えと削除は「セリフ」の画面で行う。見出しはパネルのタブが兼ねる */
export function LineEditorList({ lines, selectedId, locked, onSelect, onAdd }: Props) {
  return (
    <section className="line-editor-list" aria-label="セリフ一覧">
      <ol>
        {lines.map((line, index) => (
          <li key={line.id}>
            <button
              type="button"
              className={line.id === selectedId ? 'selected' : undefined}
              aria-current={line.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(line.id)}
            >
              <span className="line-editor-number">{index + 1}</span>
              <span className="line-editor-text">{line.text.trim() || '（空のセリフ）'}</span>
              {line.tuning && <TunedMark stale={hasStaleTuning(line)} />}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="add-line" disabled={locked} onClick={onAdd}>
        <Plus {...iconProps} />
        行を追加
      </button>
    </section>
  )
}
