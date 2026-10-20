import { FPS } from '../../core/export/frames'
import type { FrameKey } from '../../core/export/frames'

const IDLE_KEY: FrameKey = { vowel: 'closed', eye: 'open' }

/**
 * 再生位置 time のフレームの絵。口も目もフレーム番号の予定から取る：
 * 生の time で口を引くと、フレーム中央との間に母音の境目があるとき、
 * 用意していない (口, 目) の組になって立ち絵が消えてしまう。
 * 音声が予定より少し長いときは最後のフレームに留める。
 */
export function previewKeyAt(keys: readonly FrameKey[], time: number): FrameKey {
  if (keys.length === 0) return IDLE_KEY
  const frame = Math.min(Math.max(Math.floor(time * FPS), 0), keys.length - 1)
  return keys[frame]
}
