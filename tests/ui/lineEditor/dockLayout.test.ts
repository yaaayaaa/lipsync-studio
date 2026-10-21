import { describe, expect, it } from 'vitest'
import type { SerializedDockview } from 'dockview-react'
import { PANEL_IDS, loadDockLayout, saveDockLayout } from '../../../src/ui/lineEditor/dockLayout'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

const KEY = 'zunda-lipsync.lineEditorDock'

function layoutWith(ids: readonly string[], component = (id: string) => id): SerializedDockview {
  return {
    grid: { root: { type: 'branch', data: [] }, height: 600, width: 800, orientation: 'HORIZONTAL' },
    panels: Object.fromEntries(ids.map((id) => [id, { id, contentComponent: component(id), title: id }])),
  } as unknown as SerializedDockview
}

const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('line editor dock layout', () => {
  it('has nothing to restore when nothing is saved', () => {
    expect(loadDockLayout(memoryStorage())).toBeNull()
  })

  it('reads back what was saved', () => {
    const storage = memoryStorage()
    const layout = layoutWith(PANEL_IDS)
    saveDockLayout(layout, storage)
    expect(loadDockLayout(storage)).toEqual(layout)
  })

  it('ignores broken JSON', () => {
    expect(loadDockLayout(memoryStorage({ [KEY]: '{oops' }))).toBeNull()
  })

  it('ignores a layout that lacks one of the panels', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify(layoutWith(PANEL_IDS.filter((id) => id !== 'length'))) })
    expect(loadDockLayout(storage)).toBeNull()
  })

  it('ignores a layout with a panel it does not know', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify(layoutWith([...PANEL_IDS, 'extra'])) })
    expect(loadDockLayout(storage)).toBeNull()
  })

  it('ignores a layout whose panel shows another component', () => {
    const swapped = layoutWith(PANEL_IDS, (id) => (id === 'pitch' ? 'length' : id))
    expect(loadDockLayout(memoryStorage({ [KEY]: JSON.stringify(swapped) }))).toBeNull()
  })

  it('ignores a value without a grid', () => {
    const { panels } = layoutWith(PANEL_IDS)
    expect(loadDockLayout(memoryStorage({ [KEY]: JSON.stringify({ panels }) }))).toBeNull()
  })

  it('keeps working when the storage is blocked', () => {
    expect(loadDockLayout(throwing)).toBeNull()
    expect(() => saveDockLayout(layoutWith(PANEL_IDS), throwing)).not.toThrow()
  })
})
