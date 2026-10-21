import { useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { iconProps } from '../icons'
import { resetDockLayout } from '../lineEditor/dockLayout'
import { THEMES, applyTheme, loadTheme, saveTheme } from '../theme'
import type { Theme } from '../theme'

/** 画面の明暗と、1行編集のパネルの並び。どちらも書き出す動画には関係しない */
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
      <label className="field">
        <span>テーマ</span>
        <select
          value={theme}
          onChange={(e) => {
            const next = THEMES.find((t) => t.id === e.target.value)
            if (next) change(next.id)
          }}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>1行編集のパネル</span>
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
