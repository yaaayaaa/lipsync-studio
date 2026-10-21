import type { ReactNode } from 'react'
import type { LineTuning } from '../../core/character/types'
import { GLOBAL_PARAM_RANGES } from './editTuning'
import type { GlobalParam, ParamRange } from './editTuning'

const PARAMS: readonly GlobalParam[] = [
  'pitchScale',
  'intonationScale',
  'volumeScale',
  'pauseLengthScale',
  'prePhonemeLength',
  'postPhonemeLength',
]

interface Props {
  /** 話速は行の値 */
  speedScale: number
  /** 話速以外の値。作り込みがなければ /audio_query の値。取得できるまでは null */
  values: Pick<LineTuning, GlobalParam> | null
  /** 行を開いていない・書き出し中など */
  disabled: boolean
  /** 声がない・文が空などで、話速以外を動かせないとき */
  paramsDisabled: boolean
  status: string | null
  onSpeedChange(value: number): void
  onChange(key: GlobalParam, value: number): void
  /** スライダーの前に置くもの（キャラ・スタイルの選択欄） */
  selects?: ReactNode
  /** スライダーの後ろに置くもの（終端の長さ） */
  children?: ReactNode
}

function Slider({
  range,
  value,
  disabled,
  onChange,
}: {
  range: ParamRange
  value: number | null
  disabled: boolean
  onChange(value: number): void
}) {
  return (
    <label className="global-param">
      <span>{range.label}</span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        // 値が分からないうちは真ん中に置き、触れないようにする
        value={value ?? (range.min + range.max) / 2}
        disabled={disabled || value === null}
        aria-label={range.label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className="value">{value === null ? '—' : value.toFixed(2)}</output>
    </label>
  )
}

/** 行のキャラ・スタイルと全体の数値（1行編集の「その他」パネル。見出しはパネルのタブが兼ねる） */
export function GlobalParams({
  speedScale,
  values,
  disabled,
  paramsDisabled,
  status,
  onSpeedChange,
  onChange,
  selects,
  children,
}: Props) {
  return (
    <>
      {selects}
      <Slider range={GLOBAL_PARAM_RANGES.speedScale} value={speedScale} disabled={disabled} onChange={onSpeedChange} />
      {PARAMS.map((key) => (
        <Slider
          key={key}
          range={GLOBAL_PARAM_RANGES[key]}
          value={values && !paramsDisabled ? values[key] : null}
          disabled={disabled || paramsDisabled}
          onChange={(v) => onChange(key, v)}
        />
      ))}
      {status && (
        <p className="hint" role="status">
          {status}
        </p>
      )}
      <p className="hint">開始の無音・終了の無音は秒。話速は「セリフ」の一覧の話速と同じ値です。</p>
      {children}
    </>
  )
}
