import { useState } from 'react'
import { Check, LayoutTemplate, Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Dropdown } from '../Dropdown'
import { iconProps } from '../icons'
import { resetDockLayout } from '../lineEditor/dockLayout'
import { THEMES, applyTheme, loadTheme, saveTheme } from '../theme'
import type { Theme } from '../theme'
import { SettingsGroup, SettingsRow } from './SettingsGroup'

const THEME_ICONS: Record<Theme, LucideIcon> = { system: Monitor, light: Sun, dark: Moon }

/** 画面の明暗と、台本のパネルの並び。どちらも書き出す動画には関係しない */
export function AppearanceSettingsPanel() {
  const [theme, setTheme] = useState(loadTheme)
  /** 並びを戻したあとは、ボタンに「戻しました」と出す */
  const [layoutReset, setLayoutReset] = useState(false)

  const change = (next: Theme) => {
    setTheme(next)
    applyTheme(next)
    saveTheme(next)
  }

  return (
    <SettingsGroup>
      <SettingsRow name="テーマ">
        <Dropdown
          label="テーマ"
          items={THEMES.map((t) => {
            const Icon = THEME_ICONS[t.id]
            return { value: t.id, label: t.label, leading: <Icon {...iconProps} /> }
          })}
          value={theme}
          onChange={change}
        />
      </SettingsRow>
      <SettingsRow name="台本のパネル">
        {/* 押した結果は並びが変わる台本の画面でしか見えないので、ボタンの名前で戻したことを示す */}
        <button
          type="button"
          onClick={() => {
            resetDockLayout()
            setLayoutReset(true)
          }}
        >
          {layoutReset ? <Check {...iconProps} /> : <LayoutTemplate {...iconProps} />}
          {layoutReset ? '戻しました' : '初めの並びに戻す'}
        </button>
        <span role="status" className="visually-hidden">
          {layoutReset ? '台本のパネルを初めの並びに戻しました' : ''}
        </span>
      </SettingsRow>
    </SettingsGroup>
  )
}
