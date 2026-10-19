import { buildMouthTimeline } from '../lipsync/timeline'
import type { MouthTimeline } from '../lipsync/timeline'
import { prepareQuery } from './client'
import type { VoicevoxClient } from './client'

export interface Speech {
  /** 共有されるので書き換えないこと（decodeAudioData などに渡すときは複製する） */
  wav: ArrayBuffer
  timeline: MouthTimeline
}

/** 合成済み音声を覚えておく上限。48kHz モノラルで約 11 分ぶん */
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

/**
 * audio_query → speedScale を指定 → synthesis。タイムラインは合成に使ったクエリから作る。
 * 疑問形の語尾上げ（enable_interrogative_upspeak）はエンジンの既定のままにする（タイムラインがそれを前提にしている）。
 */
export async function synthesizeSpeech(
  client: VoicevoxClient,
  text: string,
  styleId: number,
  speedScale: number,
): Promise<Speech> {
  const query = prepareQuery(await client.audioQuery(text, styleId), speedScale)
  const wav = await client.synthesis(query, styleId)
  return { wav, timeline: buildMouthTimeline(query) }
}

/**
 * 同じ（文・声・話速）の合成結果を使い回す。再生し直すたびや、試聴の後の書き出しで合成を待たずに済ませるため。
 * 合成中の同じ依頼は1つにまとめ、失敗した結果は覚えない。上限を超えたら古く使ったものから捨てる。
 * エンジン URL ごとに client が作り直されるので、キャッシュも client と一緒に作り直す。
 * エンジン側のユーザー辞書を変えても、覚えている分は再読み込みまで古い読みのまま（既知の制限）。
 */
export class SpeechCache {
  private readonly entries = new Map<string, Promise<Speech>>()
  private readonly sizes = new Map<string, number>()
  private totalBytes = 0
  private readonly synthesize: (text: string, styleId: number, speedScale: number) => Promise<Speech>
  private readonly maxBytes: number

  constructor(
    synthesize: (text: string, styleId: number, speedScale: number) => Promise<Speech>,
    maxBytes = DEFAULT_MAX_BYTES,
  ) {
    this.synthesize = synthesize
    this.maxBytes = maxBytes
  }

  static forClient(client: VoicevoxClient, maxBytes?: number): SpeechCache {
    return new SpeechCache((text, styleId, speedScale) => synthesizeSpeech(client, text, styleId, speedScale), maxBytes)
  }

  speak(text: string, styleId: number, speedScale: number): Promise<Speech> {
    const key = JSON.stringify([styleId, speedScale, text])
    const cached = this.entries.get(key)
    if (cached) {
      // 使った順に並べ直す（Map は挿入順なので、入れ直すと最後になる）
      this.entries.delete(key)
      this.entries.set(key, cached)
      return cached
    }
    const pending = this.synthesize(text, styleId, speedScale)
    this.entries.set(key, pending)
    pending.then(
      (speech) => {
        if (this.entries.get(key) !== pending) return
        this.sizes.set(key, speech.wav.byteLength)
        this.totalBytes += speech.wav.byteLength
        this.evict(key)
      },
      () => {
        if (this.entries.get(key) === pending) this.entries.delete(key)
      },
    )
    return pending
  }

  /** 上限を超えた分を古い順に捨てる。今入れたもの（keep）は1件だけでも残す */
  private evict(keep: string): void {
    for (const key of this.entries.keys()) {
      if (this.totalBytes <= this.maxBytes) return
      // 合成中のものは大きさが分からないので残す
      const size = this.sizes.get(key)
      if (key === keep || size === undefined) continue
      this.entries.delete(key)
      this.sizes.delete(key)
      this.totalBytes -= size
    }
  }
}
