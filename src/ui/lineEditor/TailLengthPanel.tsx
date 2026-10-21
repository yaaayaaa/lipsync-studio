import { RotateCcw } from 'lucide-react'
import { iconProps } from '../icons'
import { TAIL_RANGE } from '../../core/export/tail'

interface Props {
  /** その行で実際に使う秒数（行の値がなければ既定値） */
  seconds: number
  /** 行が自分の値を持っているか。持っていなければ設定画面の既定値に従う */
  own: boolean
  /** 行を開いていない・書き出し中など */
  disabled: boolean
  onChange(seconds: number): void
  /** 行の値を消して既定値に戻す */
  onReset(): void
}

/** 喋り終わったあと立ち絵を映し続ける秒数（1行編集の「終端」パネル）。動かすとその行だけの値になる */
export function TailLengthPanel({ seconds, own, disabled, onChange, onReset }: Props) {
  return (
    <>
      <label className="global-param tail-param">
        <span>終端</span>
        <input
          type="range"
          min={TAIL_RANGE.min}
          max={TAIL_RANGE.max}
          step={TAIL_RANGE.step}
          value={seconds}
          disabled={disabled}
          aria-label="終端の長さ"
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output className="value">{seconds.toFixed(1)} 秒</output>
      </label>
      <div className="tail-state">
        <span className="hint" role="status">
          {own ? 'この行だけ' : '既定'}
        </span>
        <button type="button" disabled={disabled || !own} onClick={onReset}>
          <RotateCcw {...iconProps} />
          既定に戻す
        </button>
      </div>
      <p className="hint">「既定」は設定画面の値に従います。動かすとこの行だけの値になります。</p>
    </>
  )
}
