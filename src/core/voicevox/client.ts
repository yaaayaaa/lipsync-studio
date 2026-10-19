import type { AudioQuery, Speaker } from './types'

export type VoicevoxErrorKind = 'unreachable' | 'timeout' | 'http' | 'invalid-response'

export class VoicevoxError extends Error {
  readonly kind: VoicevoxErrorKind
  readonly status?: number

  constructor(kind: VoicevoxErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'VoicevoxError'
    this.kind = kind
    this.status = status
  }
}

export interface VoicevoxClientOptions {
  baseUrl: string
  timeoutMs?: number
  fetch?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 30000
const MAX_DETAIL_LENGTH = 200

// 出力を 48kHz にするのは、24kHz を受け付けない AAC エンコーダーがあるため。
// 口のタイムラインはエンジン内部のフレーム数で決まるので影響しない。
const OUTPUT_SAMPLING_RATE = 48000

export function prepareQuery(query: AudioQuery, speedScale: number): AudioQuery {
  return {
    ...structuredClone(query),
    speedScale,
    outputSamplingRate: OUTPUT_SAMPLING_RATE,
    outputStereo: false,
  }
}

async function describeHttpFailure(res: Response): Promise<string> {
  let detail = ''
  try {
    const body: unknown = JSON.parse(await res.text())
    const raw = (body as { detail?: unknown } | null)?.detail
    if (raw !== undefined) {
      detail = typeof raw === 'string' ? raw : JSON.stringify(raw)
    }
  } catch {
    // 本文が JSON でなければ、ステータスだけを伝える。
  }
  const suffix = detail ? `: ${detail.slice(0, MAX_DETAIL_LENGTH)}` : ''
  return `VOICEVOX エンジンがエラーを返しました (${res.status})${suffix}`
}

export class VoicevoxClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(opts: VoicevoxClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis)
  }

  version(): Promise<string> {
    return this.requestJson('/version', {}, (v) => typeof v === 'string')
  }

  speakers(): Promise<Speaker[]> {
    return this.requestJson('/speakers', {}, Array.isArray)
  }

  audioQuery(text: string, styleId: number): Promise<AudioQuery> {
    const params = new URLSearchParams({ text, speaker: String(styleId) })
    return this.requestJson(
      `/audio_query?${params}`,
      { method: 'POST' },
      (v) => typeof v === 'object' && v !== null && Array.isArray((v as AudioQuery).accent_phrases),
    )
  }

  synthesis(query: AudioQuery, styleId: number): Promise<ArrayBuffer> {
    return this.request(
      `/synthesis?speaker=${styleId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      },
      (res) => res.arrayBuffer(),
    )
  }

  private requestJson<T>(path: string, init: RequestInit, isValid: (v: unknown) => boolean): Promise<T> {
    return this.request(path, init, async (res) => {
      let body: unknown
      try {
        body = await res.json()
      } catch {
        throw new VoicevoxError('invalid-response', `VOICEVOX エンジンの応答が JSON ではありません (${path})`)
      }
      if (!isValid(body)) {
        throw new VoicevoxError('invalid-response', `VOICEVOX エンジンの応答の形式が想定と異なります (${path})`)
      }
      return body as T
    })
  }

  // タイムアウトは本文の読み取りまで含めて効かせる。
  private async request<T>(path: string, init: RequestInit, read: (res: Response) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: controller.signal })
      if (!res.ok) {
        throw new VoicevoxError('http', await describeHttpFailure(res), res.status)
      }
      return await read(res)
    } catch (e) {
      if (e instanceof VoicevoxError && !timedOut) throw e
      if (timedOut) {
        throw new VoicevoxError('timeout', `VOICEVOX エンジンの応答がタイムアウトしました (${this.timeoutMs / 1000}秒)`)
      }
      if (e instanceof TypeError) {
        throw new VoicevoxError('unreachable', `VOICEVOX エンジンに接続できません (${this.baseUrl})`)
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }
}
