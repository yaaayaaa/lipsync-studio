import { useState } from 'react'
import { Dropdown } from '../Dropdown'
import type { ExportSettings } from '../../core/character/types'
import { checkEncodeSupport } from '../../core/export/encode'
import { RESOLUTION_PRESETS, parseResolution, presetOf } from '../../core/export/resolution'
import type { Resolution } from '../../core/export/resolution'
import { SettingsRow } from './SettingsGroup'

const CUSTOM = 'custom'
const keyOf = (r: Resolution) => `${r.width}x${r.height}`

interface Props {
  current: ExportSettings
  disabled: boolean
  onChange(resolution: Resolution): void
  /** 入力の誤りやブラウザが対応していない大きさの知らせ。null で消す */
  onProblem(message: string | null): void
}

/**
 * 解像度の行。候補から選ぶか、「カスタム」で幅と高さを入れる。
 * カスタムは確定する前に、このアプリがその大きさで書き出せるかを確かめる（書き出しの途中で失敗しないように）
 */
export function ResolutionSetting({ current, disabled, onChange, onProblem }: Props) {
  // カスタムの入力中の値。候補の大きさのまま「カスタム」を選んだときも、入力欄を出すために持つ
  const [draft, setDraft] = useState<{ width: string; height: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const preset = presetOf(current)
  const custom = draft !== null || preset === null
  const shown = draft ?? { width: String(current.width), height: String(current.height) }

  const choose = (value: string) => {
    onProblem(null)
    if (value === CUSTOM) {
      setDraft({ width: String(current.width), height: String(current.height) })
      return
    }
    setDraft(null)
    const next = RESOLUTION_PRESETS.find((p) => keyOf(p) === value)
    if (next) onChange({ width: next.width, height: next.height })
  }

  const apply = async () => {
    const parsed = parseResolution(shown.width, shown.height)
    if ('error' in parsed) {
      onProblem(parsed.error)
      return
    }
    setChecking(true)
    try {
      const support = await checkEncodeSupport({ ...current, ...parsed })
      if (!support.ok) {
        onProblem(`${parsed.width}×${parsed.height} は書き出せません：${support.reason}`)
        return
      }
      onProblem(null)
      onChange(parsed)
      // 候補と同じ大きさになったら、候補を選んだ表示に戻す
      setDraft(presetOf(parsed) ? null : { width: String(parsed.width), height: String(parsed.height) })
    } finally {
      setChecking(false)
    }
  }

  const changed = shown.width !== String(current.width) || shown.height !== String(current.height)

  return (
    <>
      <SettingsRow name="解像度">
        <Dropdown
          label="解像度"
          items={[
            ...RESOLUTION_PRESETS.map((p) => ({ value: keyOf(p), label: p.label })),
            { value: CUSTOM, label: 'カスタム' },
          ]}
          value={custom ? CUSTOM : keyOf(current)}
          disabled={disabled}
          onChange={choose}
        />
      </SettingsRow>
      {custom && (
        <form
          className="settings-row resolution-custom"
          onSubmit={(e) => {
            e.preventDefault()
            void apply()
          }}
        >
          <span className="settings-row-name">幅 × 高さ</span>
          <span className="settings-row-control">
            <input
              type="text"
              inputMode="numeric"
              value={shown.width}
              disabled={disabled}
              aria-label="幅（ピクセル）"
              onChange={(e) => setDraft({ ...shown, width: e.target.value })}
            />
            <span aria-hidden="true">×</span>
            <input
              type="text"
              inputMode="numeric"
              value={shown.height}
              disabled={disabled}
              aria-label="高さ（ピクセル）"
              onChange={(e) => setDraft({ ...shown, height: e.target.value })}
            />
            <button type="submit" disabled={disabled || checking || !changed}>
              適用
            </button>
          </span>
        </form>
      )}
    </>
  )
}
