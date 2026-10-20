import type { EyeState } from '../character/types'

const FIRST_BLINK_MIN = 30
const FIRST_BLINK_SPAN = 60 // 30〜89 フレーム目（1〜3 秒）
const GAP_MIN = 90
const GAP_SPAN = 60 // 前の開始から 90〜149 フレーム（3〜5 秒）

const BLINK_WITH_HALF: readonly EyeState[] = ['half', 'closed', 'closed', 'half']
const BLINK_WITHOUT_HALF: readonly EyeState[] = ['closed', 'closed', 'closed']

/** 種の文字列から 32bit の値を作る（FNV-1a） */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 32bit の種で動く小さな乱数生成器（mulberry32）。0 以上 1 未満を返す。 */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 各瞬きの開始フレーム。乱数を頭から順に引くので、frameCount を延ばしても前のほうの位置は変わらない。
 * frameCount 以降に始まるものは含めない。
 */
export function blinkStarts(seed: string, frameCount: number): number[] {
  const rand = mulberry32(hashSeed(seed))
  const starts: number[] = []
  let start = FIRST_BLINK_MIN + Math.floor(rand() * FIRST_BLINK_SPAN)
  while (start < frameCount) {
    starts.push(start)
    start += GAP_MIN + Math.floor(rand() * GAP_SPAN)
  }
  return starts
}

/** frame の目の状態。瞬きどうしは最小間隔 90 フレームがあるので重ならない。 */
export function eyeAtFrame(starts: readonly number[], frame: number, hasHalf: boolean): EyeState {
  const pattern = hasHalf ? BLINK_WITH_HALF : BLINK_WITHOUT_HALF
  for (const start of starts) {
    const offset = frame - start
    if (offset >= 0 && offset < pattern.length) return pattern[offset]
  }
  return 'open'
}

export function eyeSchedule(seed: string, frameCount: number, hasHalf: boolean): EyeState[] {
  const starts = blinkStarts(seed, frameCount)
  return Array.from({ length: frameCount }, (_, frame) => eyeAtFrame(starts, frame, hasHalf))
}
