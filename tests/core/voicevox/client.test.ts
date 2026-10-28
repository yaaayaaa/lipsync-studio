import { describe, expect, it, vi } from 'vitest'
import { VoicevoxClient, VoicevoxError, prepareQuery } from '../../../src/core/voicevox/client'
import type { AudioQuery } from '../../../src/core/voicevox/types'

const BASE = 'http://localhost:50021'

const sampleQuery = (): AudioQuery => ({
  accent_phrases: [],
  speedScale: 1,
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  outputSamplingRate: 24000,
  outputStereo: true,
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const catchError = async (p: Promise<unknown>): Promise<VoicevoxError> => {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(VoicevoxError)
    return e as VoicevoxError
  }
  throw new Error('expected rejection')
}

describe('VoicevoxClient', () => {
  // main の許可リスト（electron/engineRequest.ts）は「エンジンの URL のパス + API のパス」の形を前提にしている
  it('joins API paths after a base URL with a path, with or without the trailing slash', async () => {
    const bases = ['https://example.com/voicevox', 'https://example.com/voicevox/', 'https://example.com/voicevox//']
    for (const baseUrl of bases) {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse('0.25.2'))
      await new VoicevoxClient({ baseUrl, fetch: fetchMock }).version()
      expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/voicevox/version')
    }
  })

  it('audioQuery POSTs encoded text and speaker', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleQuery()))
    const client = new VoicevoxClient({ baseUrl: `${BASE}/`, fetch: fetchMock })
    await client.audioQuery('あ', 3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/audio_query?text=%E3%81%82&speaker=3`)
    expect(init.method).toBe('POST')
  })

  it('synthesis sends JSON body without upspeak override', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    const q = sampleQuery()
    const buf = await client.synthesis(q, 7)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/synthesis?speaker=7`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(q)
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('version and speakers parse JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('0.20.0'))
      .mockResolvedValueOnce(jsonResponse([{ name: 'ずんだもん', speaker_uuid: 'u', styles: [] }]))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    expect(await client.version()).toBe('0.20.0')
    expect((await client.speakers())[0].name).toBe('ずんだもん')
  })

  it('maps non-2xx to http error with status and detail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: 'bad text' }, 422))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    const err = await catchError(client.audioQuery('x', 1))
    expect(err.kind).toBe('http')
    expect(err.status).toBe(422)
    expect(err.message).toContain('VOICEVOX')
    expect(err.message).toContain('422')
    expect(err.message).toContain('bad text')
  })

  // かな表記の誤りなどは detail が {text, error_name, error_args} で返る（エンジン 0.25.2 で確認）
  it('uses the engine\'s own message when detail is an object with text', async () => {
    const body = { detail: { text: '判別できない読み仮名があります: A', error_name: 'UNKNOWN_TEXT', error_args: { text: 'A' } } }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, 400))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    const err = await catchError(client.accentPhrases("A'", 1, true))
    expect(err.message).toBe('VOICEVOX エンジンがエラーを返しました (400): 判別できない読み仮名があります: A')
  })

  it('maps non-JSON error body to http error without detail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('oops', { status: 500 }))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    const err = await catchError(client.version())
    expect(err.kind).toBe('http')
    expect(err.status).toBe(500)
  })

  it('maps fetch TypeError to unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    const err = await catchError(client.version())
    expect(err.kind).toBe('unreachable')
    expect(err.message).toContain(BASE)
  })

  it('maps a hanging fetch to timeout', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const client = new VoicevoxClient({ baseUrl: BASE, timeoutMs: 10, fetch: fetchMock as never })
    const err = await catchError(client.version())
    expect(err.kind).toBe('timeout')
    expect(err.message).toContain('VOICEVOX')
  })

  it('gives /synthesis its own, longer timeout', async () => {
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        setTimeout(() => resolve(new Response(new ArrayBuffer(4))), 60)
      })
    const client = new VoicevoxClient({
      baseUrl: BASE,
      timeoutMs: 10,
      synthesisTimeoutMs: 500,
      fetch: hang as never,
    })
    const wav = await client.synthesis({ accent_phrases: [] } as never, 1)
    expect(wav.byteLength).toBe(4)
    const err = await catchError(client.audioQuery('a', 1))
    expect(err.kind).toBe('timeout')
  })

  it('times out /synthesis after synthesisTimeoutMs', async () => {
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    const client = new VoicevoxClient({ baseUrl: BASE, synthesisTimeoutMs: 10, fetch: hang as never })
    const err = await catchError(client.synthesis({ accent_phrases: [] } as never, 1))
    expect(err.kind).toBe('timeout')
  })

  it('maps non-array /speakers to invalid-response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ nope: true }))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    const err = await catchError(client.speakers())
    expect(err.kind).toBe('invalid-response')
  })

  it('maps non-JSON 200 body to invalid-response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>'))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    const err = await catchError(client.audioQuery('a', 1))
    expect(err.kind).toBe('invalid-response')
  })
})

describe('prepareQuery', () => {
  it('sets speed, 48kHz and mono on a copy', () => {
    const q = sampleQuery()
    const out = prepareQuery(q, 1.5)
    expect(out).toMatchObject({ speedScale: 1.5, outputSamplingRate: 48000, outputStereo: false })
    expect(q.speedScale).toBe(1)
    expect(q.outputSamplingRate).toBe(24000)
    expect(q.outputStereo).toBe(true)
    expect(out.accent_phrases).not.toBe(q.accent_phrases)
  })
})

describe('VoicevoxClient accent phrases / mora data', () => {
  it('accentPhrases POSTs text, speaker and is_kana', async () => {
    // Response の本文は 1 回しか読めないので、呼ぶたびに作る。
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse([]))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    await client.accentPhrases('あ', 3, true)
    await client.accentPhrases('あ', 3, false)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/accent_phrases?text=%E3%81%82&speaker=3&is_kana=true`)
    expect(init.method).toBe('POST')
    expect(fetchMock.mock.calls[1][0]).toContain('is_kana=false')
  })

  it('accentPhrases rejects a non-array response', async () => {
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: vi.fn().mockResolvedValue(jsonResponse({})) })
    expect((await catchError(client.accentPhrases('あ', 1, false))).kind).toBe('invalid-response')
  })

  it('moraData POSTs the phrases as a JSON array with speaker', async () => {
    const phrases = [{ moras: [], accent: 1, pause_mora: null }]
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(phrases))
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: fetchMock })
    expect(await client.moraData(phrases, 5)).toEqual(phrases)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/mora_data?speaker=5`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(phrases)
  })

  it('moraData rejects a non-array response', async () => {
    const client = new VoicevoxClient({ baseUrl: BASE, fetch: vi.fn().mockResolvedValue(jsonResponse({ a: 1 })) })
    expect((await catchError(client.moraData([], 1))).kind).toBe('invalid-response')
  })
})
