import { describe, expect, it } from 'vitest'
import { frameSchedule, placement } from '../../../src/core/export/frames'
import type { MouthTimeline } from '../../../src/core/lipsync/timeline'

describe('frameSchedule', () => {
  it('has ceil(duration * fps) frames', () => {
    const at = (duration: number): MouthTimeline => ({ segments: [{ start: 0, end: duration, vowel: 'a' }], duration })
    expect(frameSchedule(at(1.0))).toHaveLength(30)
    expect(frameSchedule(at(1.01))).toHaveLength(31)
  })

  it('samples the mouth at each frame centre', () => {
    const tl: MouthTimeline = {
      segments: [
        { start: 0, end: 0.5, vowel: 'a' },
        { start: 0.5, end: 1.0, vowel: 'closed' },
      ],
      duration: 1.0,
    }
    const frames = frameSchedule(tl)
    expect(frames[13]).toBe('a')
    expect(frames[14]).toBe('a')
    expect(frames[15]).toBe('closed')
  })

  it('covers audio that outlasts the timeline, padding with closed', () => {
    const tl: MouthTimeline = { segments: [{ start: 0, end: 0.8, vowel: 'a' }], duration: 0.8 }
    const frames = frameSchedule(tl, 30, 0.874667)
    expect(frames).toHaveLength(Math.ceil(0.874667 * 30))
    expect(frames).toHaveLength(27)
    expect(frames.slice(0, 24).every((v) => v === 'a')).toBe(true)
    expect(frames.slice(24)).toEqual(['closed', 'closed', 'closed'])
  })

  it('keeps the timeline length when the audio is shorter', () => {
    const tl: MouthTimeline = { segments: [{ start: 0, end: 1.0, vowel: 'a' }], duration: 1.0 }
    expect(frameSchedule(tl, 30, 0.9)).toEqual(frameSchedule(tl))
    expect(frameSchedule(tl, 30, 0.9)).toHaveLength(30)
  })

  it('is empty for an empty timeline', () => {
    expect(frameSchedule({ segments: [], duration: 0 })).toEqual([])
  })
})

describe('placement', () => {
  it('centres the character with height = video height * scale', () => {
    const settings = { width: 1920, height: 1080, scale: 0.9, background: '#00FF00' }
    expect(placement(settings, { width: 1000, height: 2000 })).toEqual({ height: 972, width: 486, x: 717, y: 54 })
  })
})
