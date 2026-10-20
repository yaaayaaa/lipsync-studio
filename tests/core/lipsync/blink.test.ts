import { describe, expect, it } from 'vitest'
import { blinkStarts, eyeAtFrame, eyeSchedule } from '../../../src/core/lipsync/blink'

const seeds = Array.from({ length: 20 }, (_, i) => `line-${i}`)

describe('blinkStarts', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(blinkStarts('a', 900)).toEqual(blinkStarts('a', 900))
    expect(blinkStarts('a', 900)).not.toEqual(blinkStarts('b', 900))
  })

  it('starts within 30-89 and spaces starts by 90-149 frames', () => {
    for (const seed of seeds) {
      const starts = blinkStarts(seed, 3000)
      expect(starts.length).toBeGreaterThan(10)
      expect(starts[0]).toBeGreaterThanOrEqual(30)
      expect(starts[0]).toBeLessThanOrEqual(89)
      for (let i = 1; i < starts.length; i++) {
        const gap = starts[i] - starts[i - 1]
        expect(gap).toBeGreaterThanOrEqual(90)
        expect(gap).toBeLessThanOrEqual(149)
      }
      expect(starts.every((s) => s + 4 <= 3000)).toBe(true)
    }
  })

  it('keeps earlier starts when frameCount grows', () => {
    for (const seed of seeds) {
      const short = blinkStarts(seed, 300)
      expect(blinkStarts(seed, 900).slice(0, short.length)).toEqual(short)
    }
  })

  it('is empty when frameCount is under 34 (the earliest blink needs 30 + 4 frames)', () => {
    expect(blinkStarts('a', 33)).toEqual([])
    expect(blinkStarts('a', 0)).toEqual([])
  })

  it('leaves out a blink that the clip end would cut', () => {
    for (const seed of seeds) {
      const [first] = blinkStarts(seed, 3000)
      // 4 フレーム（半目ありの長さ）が収まるときだけ入る
      expect(blinkStarts(seed, first + 4)[0]).toBe(first)
      expect(blinkStarts(seed, first + 3)).toEqual([])
      expect(blinkStarts(seed, first + 1)).toEqual([])
    }
  })
})

describe('eyeAtFrame', () => {
  const frames = [29, 30, 31, 32, 33, 34]
  it('maps a blink with a half-closed eye', () => {
    expect(frames.map((f) => eyeAtFrame([30], f, true))).toEqual(['open', 'half', 'closed', 'closed', 'half', 'open'])
  })
  it('maps a blink without a half-closed eye', () => {
    expect(frames.map((f) => eyeAtFrame([30], f, false))).toEqual(['open', 'closed', 'closed', 'closed', 'open', 'open'])
  })
  it('finds the right blink among several', () => {
    expect(eyeAtFrame([30, 150], 151, true)).toBe('closed')
    expect(eyeAtFrame([30, 150], 100, true)).toBe('open')
  })
})

describe('eyeSchedule', () => {
  it('has one entry per frame consistent with eyeAtFrame', () => {
    const starts = blinkStarts('s', 200)
    const sched = eyeSchedule('s', 200, true)
    expect(sched).toHaveLength(200)
    expect(sched).toEqual(Array.from({ length: 200 }, (_, f) => eyeAtFrame(starts, f, true)))
    expect(sched).toContain('closed')
  })

  it('never ends the clip in the middle of a blink', () => {
    for (const seed of seeds) {
      const [first] = blinkStarts(seed, 3000)
      for (const hasHalf of [true, false]) {
        for (const frameCount of [first + 1, first + 2, first + 3]) {
          expect(eyeSchedule(seed, frameCount, hasHalf).every((e) => e === 'open')).toBe(true)
        }
        const whole = eyeSchedule(seed, first + 4, hasHalf)
        expect(whole.at(-1)).toBe(hasHalf ? 'half' : 'open')
        expect(whole.slice(first)).toEqual(hasHalf ? ['half', 'closed', 'closed', 'half'] : ['closed', 'closed', 'closed', 'open'])
      }
    }
  })
})
