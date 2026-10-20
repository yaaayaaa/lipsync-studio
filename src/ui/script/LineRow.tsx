import { ArrowDown, ArrowUp, SquarePen, Trash2 } from 'lucide-react'
import { iconProps } from '../icons'
import type { Character, ScriptLine } from '../../core/character/types'
import type { LineProblem } from '../../core/storage/db'
import { RowMenu } from '../character/RowMenu'
import { LineCharacterSelects, LineTextArea, TunedMark } from './LineFields'
import { PROBLEM_LABELS, canListen } from './lineJobs'
import { SPEED_MAX, SPEED_MIN, SPEED_STEP } from './speed'
import type { PlaybackMode } from './useLinePlayback'

export type LineStatus =
  | { state: 'exporting'; progress: number }
  | { state: 'done'; fileName: string }
  | { state: 'error'; message: string }

interface Props {
  line: ScriptLine
  index: number
  count: number
  characters: Character[]
  problem: LineProblem | null
  status: LineStatus | undefined
  /** この行で再生中（または合成中）のもの */
  playing: { mode: PlaybackMode; loading: boolean } | null
  /** 書き出し中は行の編集と操作を止める */
  locked: boolean
  onChange(patch: Partial<ScriptLine>): void
  /** 今の行から次の行を作る（作り込みを捨てるなど、項目を消す変更に使う） */
  onEdit(fn: (line: ScriptLine) => ScriptLine): void
  onMove(delta: -1 | 1): void
  onRemove(): void
  onPlay(mode: PlaybackMode): void
  onStop(): void
  onExport(): void
  onOpenEditor(): void
}

export function LineRow(props: Props) {
  const { line, index, count, characters, problem, status, playing, locked } = props
  const playButton = (mode: PlaybackMode, label: string) =>
    playing?.mode === mode ? (
      <button type="button" onClick={props.onStop}>
        {playing.loading ? '合成中…' : '停止'}
      </button>
    ) : (
      <button
        type="button"
        disabled={(mode === 'listen' ? !canListen(problem) : problem !== null) || locked}
        onClick={() => props.onPlay(mode)}
      >
        {label}
      </button>
    )

  return (
    <li className={`line-row${problem ? ' has-problem' : ''}`}>
      <div className="line-index">
        {String(index + 1).padStart(3, '0')}
        {line.tuning && <TunedMark />}
      </div>
      <div className="line-main">
        <LineTextArea line={line} disabled={locked} label={`${index + 1}行目のセリフ`} onEdit={props.onEdit} />
        <div className="line-controls">
          <LineCharacterSelects line={line} characters={characters} disabled={locked} onChange={props.onChange} />
          <label className="speed">
            <span>話速</span>
            <input
              type="range"
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={SPEED_STEP}
              value={line.speedScale}
              disabled={locked}
              aria-label="話速"
              onChange={(e) => props.onChange({ speedScale: Number(e.target.value) })}
            />
            <output className="value">{line.speedScale.toFixed(2)}</output>
          </label>
        </div>
        {problem && <p className="line-problem">{PROBLEM_LABELS[problem]}</p>}
        {/* 理由が行の問題そのものなら、上の表示と重ねない */}
        {status?.state === 'error' && !(problem && status.message === PROBLEM_LABELS[problem]) && (
          <p className="line-problem" role="alert">
            {status.message}
          </p>
        )}
        {status?.state === 'exporting' && (
          <p className="hint">
            書き出し中… <progress max={1} value={status.progress} /> {Math.round(status.progress * 100)}%
          </p>
        )}
        {status?.state === 'done' && <p className="hint">書き出しました：{status.fileName}</p>}
      </div>
      <div className="line-actions">
        {playButton('listen', '試聴')}
        {playButton('preview', 'プレビュー')}
        <button type="button" disabled={problem !== null || locked} onClick={props.onExport}>
          書き出し
        </button>
        <span className="line-order">
          <button type="button" disabled={locked || index === 0} aria-label="上へ" onClick={() => props.onMove(-1)}>
            <ArrowUp {...iconProps} />
          </button>
          <button
            type="button"
            disabled={locked || index === count - 1}
            aria-label="下へ"
            onClick={() => props.onMove(1)}
          >
            <ArrowDown {...iconProps} />
          </button>
          <RowMenu
            label={`${index + 1}行目の操作`}
            items={[
              { label: '1行編集で開く', icon: SquarePen, disabled: locked, onSelect: props.onOpenEditor },
              { label: '削除', icon: Trash2, danger: true, disabled: locked, onSelect: props.onRemove },
            ]}
          />
        </span>
      </div>
    </li>
  )
}
