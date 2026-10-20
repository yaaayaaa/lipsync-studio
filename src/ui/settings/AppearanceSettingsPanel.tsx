import { useState } from 'react'
import { THEMES, applyTheme, loadTheme, saveTheme } from '../theme'
import type { Theme } from '../theme'

/** 画面の明暗。書き出す動画には関係しない */
export function AppearanceSettingsPanel() {
  const [theme, setTheme] = useState(loadTheme)

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
      <p className="hint">このブラウザだけに覚えます。書き出す動画の色は変わりません。</p>
    </section>
  )
}
