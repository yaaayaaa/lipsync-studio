import { useState } from 'react'
import type { ExportSettings } from '../../core/character/types'
import { TAIL_RANGE } from '../../core/export/tail'
import { useApp } from '../useApp'
import { errorMessage } from '../script/lineJobs'
import { ResolutionSetting } from './ResolutionSetting'
import { SettingsGroup, SettingsRow } from './SettingsGroup'

const SCALE_MIN = 0.3
const SCALE_MAX = 1.5
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** 解像度・拡大率・終端の長さ・背景色。全行の書き出しにも1行ずつの書き出しにも効く */
export function ExportSettingsPanel({ disabled }: { disabled: boolean }) {
  const { settings, saveSettings } = useApp()
  const current = settings.export
  const [error, setError] = useState<string | null>(null)
  // 色の文字入力は途中の値（"#00F" など）を持てるよう、確定するまで別に持つ
  const [colorDraft, setColorDraft] = useState<string | null>(null)
  const [resolutionProblem, setResolutionProblem] = useState<string | null>(null)

  const update = (patch: Partial<ExportSettings>) => {
    setError(null)
    saveSettings({ ...settings, export: { ...current, ...patch } }).catch((e: unknown) =>
      setError(`書き出し設定を保存できませんでした: ${errorMessage(e)}`),
    )
  }

  const commitColor = () => {
    if (colorDraft === null) return
    if (HEX_COLOR.test(colorDraft)) update({ background: colorDraft.toUpperCase() })
    setColorDraft(null)
  }

  return (
    <>
      {disabled && <p className="notice">書き出し中は書き出しの設定を変えられません</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <SettingsGroup
        footer={
          resolutionProblem || (colorDraft !== null && !HEX_COLOR.test(colorDraft)) ? (
            <>
              {resolutionProblem && <p className="field-error">{resolutionProblem}</p>}
              {colorDraft !== null && !HEX_COLOR.test(colorDraft) && <p>#RRGGBB の形で入力してください</p>}
            </>
          ) : (
            <p>解像度はカスタムで、幅と高さを 16〜3840 の偶数で決められます。</p>
          )
        }
      >
        <ResolutionSetting
          current={current}
          disabled={disabled}
          onChange={(r) => update({ width: r.width, height: r.height })}
          onProblem={setResolutionProblem}
        />
        <SettingsRow name="背景色">
          <input
            type="color"
            value={current.background.toLowerCase()}
            disabled={disabled}
            aria-label="背景色"
            onChange={(e) => update({ background: e.target.value.toUpperCase() })}
          />
          <input
            type="text"
            className="color-text"
            value={colorDraft ?? current.background}
            disabled={disabled}
            aria-label="背景色（#RRGGBB）"
            onChange={(e) => setColorDraft(e.target.value.trim())}
            onBlur={commitColor}
            onKeyDown={(e) => e.key === 'Enter' && commitColor()}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup footer={<p>拡大率は「立ち絵の高さ ÷ 動画の高さ」です。立ち絵は中央に置きます。</p>}>
        <SettingsRow name="拡大率" label>
          <input
            type="range"
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.05}
            value={current.scale}
            disabled={disabled}
            onChange={(e) => update({ scale: Number(e.target.value) })}
          />
          <output className="value">{current.scale.toFixed(2)}</output>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup footer={<p>喋り終わったあと、立ち絵を映し続ける長さ。台本で行ごとに変えられます。</p>}>
        <SettingsRow name="終端の長さ" label>
          <input
            type="range"
            min={TAIL_RANGE.min}
            max={TAIL_RANGE.max}
            step={TAIL_RANGE.step}
            value={current.tailSeconds}
            disabled={disabled}
            onChange={(e) => update({ tailSeconds: Number(e.target.value) })}
          />
          <output className="value">{current.tailSeconds.toFixed(1)} 秒</output>
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
