import { describe, expect, it, vi } from 'vitest'
import { createPositionStore, resumePosition } from '../../../src/ui/script/playbackPosition'

describe('createPositionStore', () => {
  it('notifies listeners only when the position changes', () => {
    const store = createPositionStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.set({ time: 0.5, duration: 2 })
    store.set({ time: 0.5, duration: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get()).toEqual({ time: 0.5, duration: 2 })
    store.set(null)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    store.set({ time: 1, duration: 2 })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('resumePosition', () => {
  it('resumes where playback stopped', () => {
    expect(resumePosition({ time: 0.8, duration: 2 })).toBe(0.8)
  })

  it('starts over after playing to the end, or with nothing played yet', () => {
    expect(resumePosition({ time: 2, duration: 2 })).toBe(0)
    expect(resumePosition({ time: 1.97, duration: 2 })).toBe(0)
    expect(resumePosition(null)).toBe(0)
  })
})
