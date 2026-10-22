// 画面の明暗。見る人・端末ごとの好みなので、IndexedDB の設定ではなくブラウザ（localStorage）に覚える。
// localStorage は同期で読めるので、最初の描画より前に当てられ、明るい画面が一瞬出ることもない。

export type Theme = 'system' | 'light' | 'dark'

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'OS の設定に合わせる' },
  { id: 'light', label: 'ライト' },
  { id: 'dark', label: 'ダーク' },
]

// 頭は改名前の名前のまま：変えると保存済みの状態を読めなくなる
const THEME_KEY = 'zunda-lipsync.theme'

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

const isTheme = (v: unknown): v is Theme => THEMES.some((t) => t.id === v)

/** 覚えていない・読めないときは OS の設定に合わせる */
export function loadTheme(storage: ThemeStorage = localStorage): Theme {
  try {
    const saved = storage.getItem(THEME_KEY)
    return isTheme(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

/** 覚えられなくても（プライベートモードなど）、今開いている画面には当たっている */
export function saveTheme(theme: Theme, storage: ThemeStorage = localStorage): void {
  try {
    storage.setItem(THEME_KEY, theme)
  } catch {
    // 次に開いたときは OS の設定に戻るだけ
  }
}

/** <html> の data-theme に入れる値。OS に合わせるときは付けない（app.css が prefers-color-scheme で切り替える） */
export function themeAttribute(theme: Theme): 'light' | 'dark' | null {
  return theme === 'system' ? null : theme
}

export function applyTheme(theme: Theme): void {
  const value = themeAttribute(theme)
  if (value) document.documentElement.dataset.theme = value
  else delete document.documentElement.dataset.theme
}
