import type { AudioQuery } from '../voicevox/types'
import { blinkStarts } from './blink'
import { buildMouthTimeline, type MouthSegment } from './timeline'

/** 外部のツール（動画の自動生成など）から使う、1行ぶんの入力。query は /synthesis に渡したものと同じ。 */
export interface TimelineRequest {
  id: string
  query: AudioQuery
}

export interface TimelineResult {
  id: string
  segments: MouthSegment[]
  /** 口のタイムラインの長さ（秒）。合成 WAV の長さと 1/30 秒以内で一致する（scripts/check-timeline.ts で照合済み） */
  duration: number
  /** 瞬きの開始フレーム（fps 基準）。アプリと同じく id を種にするので、同じ id なら毎回同じ */
  blinkStarts: number[]
}

/**
 * 複数行の口のタイムラインと瞬きの位置をまとめて作る（エンジンには問い合わせない純粋な計算）。
 * fps はアプリの書き出しと同じ 30 が既定。瞬きは動画の長さ（duration × fps）の中に収まるものだけ。
 */
export function buildTimelines(requests: TimelineRequest[], fps = 30): TimelineResult[] {
  if (!(fps > 0)) throw new Error(`fps must be positive, got ${fps}`)
  const seen = new Set<string>()
  return requests.map(({ id, query }) => {
    if (seen.has(id)) throw new Error(`duplicate id: ${id}`)
    seen.add(id)
    const { segments, duration } = buildMouthTimeline(query)
    return { id, segments, duration, blinkStarts: blinkStarts(id, Math.floor(duration * fps)) }
  })
}
