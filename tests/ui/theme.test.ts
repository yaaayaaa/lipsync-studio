import { describe, expect, it } from 'vitest'
import { loadTheme, saveTheme, themeAttribute } from '../../src/ui/theme'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('theme', () => {
  it('follows the OS when nothing or an unknown value is stored', () => {
    expect(loadTheme(memoryStorage())).toBe('system')
    expect(loadTheme(memoryStorage({ 'zunda-lipsync.theme': 'sepia' }))).toBe('system')
  })

  it('round-trips the chosen theme', () => {
    const storage = memoryStorage()
    saveTheme('dark', storage)
    expect(loadTheme(storage)).toBe('dark')
    saveTheme('light', storage)
    expect(loadTheme(storage)).toBe('light')
  })

  it('falls back to the OS setting when storage is unavailable', () => {
    expect(loadTheme(throwing)).toBe('system')
    expect(() => saveTheme('dark', throwing)).not.toThrow()
  })

  it('sets data-theme only when a theme is chosen explicitly', () => {
    expect(themeAttribute('system')).toBeNull()
    expect(themeAttribute('light')).toBe('light')
    expect(themeAttribute('dark')).toBe('dark')
  })
})
