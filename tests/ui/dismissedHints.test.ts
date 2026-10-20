import { describe, expect, it } from 'vitest'
import { dismissHint, loadDismissedHints } from '../../src/ui/dismissedHints'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('dismissed hints', () => {
  it('starts with nothing dismissed', () => {
    expect(loadDismissedHints(memoryStorage()).size).toBe(0)
  })

  it('remembers each dismissed hint once', () => {
    const storage = memoryStorage()
    dismissHint('eye', storage)
    dismissHint('eye', storage)
    dismissHint('mouth', storage)
    expect([...loadDismissedHints(storage)].sort()).toEqual(['eye', 'mouth'])
  })

  it('treats broken or foreign data as nothing dismissed', () => {
    expect(loadDismissedHints(memoryStorage({ 'zunda-lipsync.dismissedHints': '{oops' })).size).toBe(0)
    expect(loadDismissedHints(memoryStorage({ 'zunda-lipsync.dismissedHints': '{"a":1}' })).size).toBe(0)
    expect([...loadDismissedHints(memoryStorage({ 'zunda-lipsync.dismissedHints': '["eye",3]' }))]).toEqual(['eye'])
  })

  it('shows hints again when storage cannot be read, and does not throw when it cannot be written', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadDismissedHints(throwing).size).toBe(0)
    expect(() => dismissHint('eye', throwing)).not.toThrow()
  })
})
