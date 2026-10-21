import { describe, expect, it } from 'vitest'
import type { ScriptLine } from '../../../src/core/character/types'
import { loadEditingLine, resolveEditingLine, saveEditingLine } from '../../../src/ui/script/editingLine'

const line = (id: string) => ({ id }) as ScriptLine

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('resolveEditingLine', () => {
  const lines = [line('a'), line('b'), line('c')]

  it('keeps the line opened before', () => {
    expect(resolveEditingLine(lines, 'b')).toBe('b')
  })

  it('opens the first line when nothing was opened or the opened line is gone', () => {
    expect(resolveEditingLine(lines, null)).toBe('a')
    expect(resolveEditingLine(lines, 'deleted')).toBe('a')
  })

  it('opens nothing while loading or without lines', () => {
    expect(resolveEditingLine(null, 'b')).toBeNull()
    expect(resolveEditingLine([], 'b')).toBeNull()
  })
})

describe('remembered editing line', () => {
  it('reads back the saved line', () => {
    const storage = memoryStorage()
    expect(loadEditingLine(storage)).toBeNull()
    saveEditingLine('b', storage)
    expect(loadEditingLine(storage)).toBe('b')
  })

  it('works when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadEditingLine(blocked)).toBeNull()
    expect(() => saveEditingLine('b', blocked)).not.toThrow()
  })
})
