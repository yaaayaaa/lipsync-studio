import { describe, expect, it } from 'vitest'
import { FPS, frameSchedule, lineFrameKeys } from '../../../src/core/export/frames'
import type { FrameKey } from '../../../src/core/export/frames'
import { mouthAt } from '../../../src/core/lipsync/timeline'
import type { MouthTimeline } from '../../../src/core/lipsync/timeline'
import { previewKeyAt } from '../../../src/ui/script/previewKey'

// 母音の境目 0.51 秒は、フレーム 15 の区間 [0.5, 0.5333) の中にある（中央は約 0.5167）
const timeline: MouthTimeline = {
  segments: [
    { start: 0, end: 0.51, vowel: 'a' },
    { start: 0.51, end: 1, vowel: 'i' },
  ],
  duration: 1,
}

describe('previewKeyAt', () => {
  const vowels = frameSchedule(timeline)
  const keys = lineFrameKeys(vowels, { seed: 'x', hasHalf: true })

  it('takes the mouth from the frame schedule, not the raw time', () => {
    const time = 15 / FPS + 0.001
    expect(mouthAt(timeline, time)).not.toBe(vowels[15])
    expect(previewKeyAt(keys, time)).toEqual({ vowel: vowels[15], eye: keys[15].eye })
  })

  it('always returns a key that was prepared, even during a blink', () => {
    const prepared = new Set(keys.map((k: FrameKey) => `${k.vowel}:${k.eye}`))
    for (let t = 0; t < 1.2; t += 0.001) {
      const k = previewKeyAt(keys, t)
      expect(prepared.has(`${k.vowel}:${k.eye}`)).toBe(true)
    }
  })

  it('holds the last frame past the end and handles an empty schedule', () => {
    expect(previewKeyAt(keys, 99)).toEqual(keys.at(-1))
    expect(previewKeyAt([], 1)).toEqual({ vowel: 'closed', eye: 'open' })
  })
})
