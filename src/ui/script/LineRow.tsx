import type { Character, ScriptLine } from '../../core/character/types'
import type { LineProblem } from '../../core/storage/db'
import { PROBLEM_LABELS, canListen } from './lineJobs'

export const SPEED_MIN = 0.5
export const SPEED_MAX = 2.0
export const SPEED_STEP = 0.05

export type LineStatus =
  | { state: 'exporting'; progress: number }
  | { state: 'done'; fileName: string }
  | { state: 'error'; message: string }

export type PlaybackMode = 'listen' | 'preview'

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
  onMove(delta: -1 | 1): void
  onRemove(): void
  onPlay(mode: PlaybackMode): void
  onStop(): void
  onExport(): void
}

export function LineRow(props: Props) {
  const { line, index, count, characters, problem, status, playing, locked } = props
  const character = characters.find((c) => c.id === line.characterId)
  const expressionKnown = character?.expressions.some((e) => e.id === line.expressionId) ?? false

  const selectCharacter = (id: string) => {
    const next = characters.find((c) => c.id === id)
    props.onChange({ characterId: next?.id ?? null, expressionId: next?.expressions[0]?.id ?? null })
  }

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
      <div className="line-index">{String(index + 1).padStart(3, '0')}</div>
      <div className="line-main">
        <textarea
          className="line-text"
          rows={2}
          value={line.text}
          placeholder="セリフを入力"
          disabled={locked}
          aria-label={`${index + 1}行目のセリフ`}
          onChange={(e) => props.onChange({ text: e.target.value })}
        />
        <div className="line-controls">
          <select
            value={character ? character.id : ''}
            disabled={locked}
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
            disabled={locked || !character}
            aria-label="表情"
            onChange={(e) => props.onChange({ expressionId: e.target.value || null })}
          >
            <option value="">{line.expressionId && character && !expressionKnown ? '（削除された表情）' : '表情を選択'}</option>
            {character?.expressions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
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
            ↑
          </button>
          <button
            type="button"
            disabled={locked || index === count - 1}
            aria-label="下へ"
            onClick={() => props.onMove(1)}
          >
            ↓
          </button>
          <button type="button" className="danger" disabled={locked} onClick={props.onRemove}>
            削除
          </button>
        </span>
      </div>
    </li>
  )
}
