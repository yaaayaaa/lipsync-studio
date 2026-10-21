import { MORA_LENGTH_RANGE, MORA_PITCH_RANGE, PAUSE_LENGTH_RANGE, setMoraLength, setMoraPitch, setPauseLength } from '../../core/voicevox/phraseEdit'
import type { AccentPhrase } from '../../core/voicevox/types'
import { phonemeLabel } from './phoneme'

interface TabProps {
  phrases: AccentPhrase[]
  disabled: boolean
  onChange(fn: (phrases: AccentPhrase[]) => AccentPhrase[]): void
}

interface SliderProps {
  label: string
  range: { min: number; max: number; step: number }
  value: number | null
  disabled: boolean
  caption: string
  onChange(value: number): void
}

/** 縦のつまみ。値がないとき（無声のモーラ・子音のないモーラ）は触れない */
function VerticalSlider({ label, range, value, disabled, caption, onChange }: SliderProps) {
  const off = disabled || value === null
  return (
    <label className={off && value === null ? 'mora-slider empty' : 'mora-slider'}>
      <output className="value">{value === null ? '—' : value.toFixed(2)}</output>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value ?? range.min}
        disabled={off}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="mora-slider-caption">{caption}</span>
    </label>
  )
}

const where = (pi: number, mi: number, text: string) => `${pi + 1}句目「${text}」（${mi + 1}拍目）`

/** 高さ：モーラごとの縦のつまみ。無声のモーラ（高さ 0）は動かせない */
export function PitchTab({ phrases, disabled, onChange }: TabProps) {
  return (
    <div className="phrase-strip">
      {phrases.map((p, pi) => (
        <div key={pi} className="phrase sliders">
          {p.moras.map((m, mi) => (
            <VerticalSlider
              key={mi}
              label={`${where(pi, mi, m.text)}の高さ${m.pitch === 0 ? '（無声）' : ''}`}
              range={MORA_PITCH_RANGE}
              value={m.pitch === 0 ? null : m.pitch}
              disabled={disabled}
              caption={m.text}
              onChange={(v) => onChange((ps) => setMoraPitch(ps, pi, mi, v))}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 長さ：モーラごとの子音と母音の長さ、句の後ろの無音（秒） */
export function LengthTab({ phrases, disabled, onChange }: TabProps) {
  return (
    <div className="phrase-strip">
      {phrases.map((p, pi) => (
        <div key={pi} className="phrase sliders">
          {p.moras.map((m, mi) => (
            <div key={mi} className="mora-lengths">
              <div className="mora-lengths-pair">
                {/* 子音のないモーラ（ア・ン など）は、子音のつまみ自体を出さない */}
                {m.consonant !== null && (
                  <VerticalSlider
                    label={`${where(pi, mi, m.text)}の子音の長さ`}
                    range={MORA_LENGTH_RANGE}
                    value={m.consonant_length}
                    disabled={disabled}
                    caption={phonemeLabel(m.consonant)}
                    onChange={(v) => onChange((ps) => setMoraLength(ps, pi, mi, 'consonant', v))}
                  />
                )}
                <VerticalSlider
                  label={`${where(pi, mi, m.text)}の母音の長さ`}
                  range={MORA_LENGTH_RANGE}
                  value={m.vowel_length}
                  disabled={disabled}
                  caption={phonemeLabel(m.vowel)}
                  onChange={(v) => onChange((ps) => setMoraLength(ps, pi, mi, 'vowel', v))}
                />
              </div>
              <span className="mora-text">{m.text}</span>
            </div>
          ))}
          {p.pause_mora && (
            <div className="mora-lengths pause">
              <VerticalSlider
                label={`${pi + 1}句目の後ろの無音`}
                range={PAUSE_LENGTH_RANGE}
                value={p.pause_mora.vowel_length}
                disabled={disabled}
                caption="無音"
                onChange={(v) => onChange((ps) => setPauseLength(ps, pi, v))}
              />
              <span className="mora-text">、</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
