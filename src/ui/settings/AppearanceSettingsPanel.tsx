import { useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { Dropdown } from '../Dropdown'
import { iconProps } from '../icons'
import { resetDockLayout } from '../lineEditor/dockLayout'
import { THEMES, applyTheme, loadTheme, saveTheme } from '../theme'
import type { Theme } from '../theme'

/** 画面の明暗と、台本のパネルの並び。どちらも書き出す動画には関係しない */
export function AppearanceSettingsPanel() {
  const [theme, setTheme] = useState(loadTheme)
  /** 並びを戻した直後だけ「戻しました」と出す */
  const [layoutReset, setLayoutReset] = useState(false)

  const change = (next: Theme) => {
    setTheme(next)
    applyTheme(next)
    saveTheme(next)
  }

  return (
    <section className="panel">
      <h2>表示</h2>
      <div className="field">
        <span>テーマ</span>
        <Dropdown
          label="テーマ"
          items={THEMES.map((t) => ({ value: t.id, label: t.label }))}
          value={theme}
          onChange={change}
        />
      </div>
      <div className="field">
        <span>台本のパネル</span>
        <button
          type="button"
          onClick={() => {
            resetDockLayout()
            setLayoutReset(true)
          }}
        >
          <LayoutTemplate {...iconProps} />
          初めの並びに戻す
        </button>
        {layoutReset && (
          <span className="hint" role="status">
            戻しました
          </span>
        )}
      </div>
      <p className="hint">テーマとパネルの並びは、このブラウザだけに覚えます。書き出す動画は変わりません。</p>
    </section>
  )
}
