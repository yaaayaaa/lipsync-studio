import { buildMouthTimeline } from '../lipsync/timeline'
import type { MouthTimeline } from '../lipsync/timeline'
import type { LineTuning, ScriptLine } from '../character/types'
import { prepareQuery } from './client'
import type { VoicevoxClient } from './client'
import { isTuningStale, queryFromTuning, resolveTuning } from './tuning'
import type { AudioQuery } from './types'

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

export interface SpeechSynthesizers {
  synthesizeText: (text: string, styleId: number, speedScale: number) => Promise<Speech>
  /** 作り込み済みのクエリをそのまま合成する（prepareQuery 済みであること） */
  synthesizeQuery: (query: AudioQuery, styleId: number) => Promise<Speech>
}

/**
 * 同じ（文・声・話速、または作り込み済みクエリ・声）の合成結果を使い回す。再生し直すたびや、試聴の後の書き出しで合成を待たずに済ませるため。
 * 合成中の同じ依頼は1つにまとめ、失敗した結果は覚えない。上限を超えたら古く使ったものから捨てる。
 * エンジン URL ごとに client が作り直されるので、キャッシュも client と一緒に作り直す。
 * エンジン側のユーザー辞書を変えても、覚えている分は再読み込みまで古い読みのまま（既知の制限）。
 */
export class SpeechCache {
  private readonly entries = new Map<string, Promise<Speech>>()
  private readonly sizes = new Map<string, number>()
  private totalBytes = 0
  private readonly synthesizers: SpeechSynthesizers
  private readonly maxBytes: number

  constructor(synthesizers: SpeechSynthesizers, maxBytes = DEFAULT_MAX_BYTES) {
    this.synthesizers = synthesizers
    this.maxBytes = maxBytes
  }

  static forClient(client: VoicevoxClient, maxBytes?: number): SpeechCache {
    return new SpeechCache(
      {
        synthesizeText: (text, styleId, speedScale) => synthesizeSpeech(client, text, styleId, speedScale),
        synthesizeQuery: async (query, styleId) => ({
          wav: await client.synthesis(query, styleId),
          timeline: buildMouthTimeline(query),
        }),
      },
      maxBytes,
    )
  }

  /** 作り込みなしの行。鍵の先頭の種別で、文の鍵とクエリの鍵が混ざらないようにする */
  speak(text: string, styleId: number, speedScale: number): Promise<Speech> {
    return this.lookup(JSON.stringify(['text', styleId, speedScale, text]), () =>
      this.synthesizers.synthesizeText(text, styleId, speedScale),
    )
  }

  /** 作り込み済みのクエリ。1モーラの高さが 0.01 違っても別の合成になる */
  speakQuery(query: AudioQuery, styleId: number): Promise<Speech> {
    return this.lookup(JSON.stringify(['query', styleId, query]), () => this.synthesizers.synthesizeQuery(query, styleId))
  }

  private lookup(key: string, synthesize: () => Promise<Speech>): Promise<Speech> {
    const cached = this.entries.get(key)
    if (cached) {
      // 使った順に並べ直す（Map は挿入順なので、入れ直すと最後になる）
      this.entries.delete(key)
      this.entries.set(key, cached)
      return cached
    }
    const pending = synthesize()
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

/**
 * 1行ぶんの音声。作り込みがあって文と合っていればそれを使い、なければ文から合成する。
 * 声が違って高さと長さを取り直したときだけ `tuning` を返す（呼び出し側が保存する）。
 */
export async function speakLine(
  cache: SpeechCache,
  client: Pick<VoicevoxClient, 'moraData'>,
  line: ScriptLine,
  styleId: number,
): Promise<{ speech: Speech; tuning?: LineTuning }> {
  if (!line.tuning || isTuningStale(line.tuning, line.text)) {
    return { speech: await cache.speak(line.text, styleId, line.speedScale) }
  }
  const { tuning, refreshed } = await resolveTuning(client, line.tuning, styleId)
  const speech = await cache.speakQuery(queryFromTuning(tuning, line.speedScale), styleId)
  return refreshed ? { speech, tuning } : { speech }
}
