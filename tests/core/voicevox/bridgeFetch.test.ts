import { describe, expect, test, vi } from 'vitest'
import { createBridgeFetch } from '../../../src/core/voicevox/bridgeFetch'
import { VoicevoxClient, VoicevoxError } from '../../../src/core/voicevox/client'
import type { DesktopBridge, EngineRequest, EngineResponse } from '../../../electron/engineTypes'

const encode = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer

const ok = (body: string, status = 200, headers: Record<string, string> = {}): EngineResponse => ({
  status,
  statusText: status === 200 ? 'OK' : 'Unprocessable Entity',
  headers,
  body: encode(body),
})

const bridgeReturning = (impl: (req: EngineRequest) => Promise<EngineResponse>) => {
  const engineFetch = vi.fn(impl)
  const bridge: DesktopBridge = { engineFetch }
  return { bridge, engineFetch }
}

describe('createBridgeFetch', () => {
  test('200 と JSON 本文をそのまま Response にする', async () => {
    const { bridge } = bridgeReturning(async () => ok('{"a":1}', 200, { 'content-type': 'application/json' }))
    const res = await createBridgeFetch(bridge)('http://localhost:50021/version')
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ a: 1 })
  })

  test('422 は ok=false で本文が読める', async () => {
    const { bridge } = bridgeReturning(async () => ok('{"detail":"bad"}', 422))
    const res = await createBridgeFetch(bridge)('http://localhost:50021/audio_query', { method: 'POST' })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(422)
    expect(await res.text()).toBe('{"detail":"bad"}')
  })

  test('204 のように本文を持てないステータスでも失敗しない', async () => {
    const { bridge } = bridgeReturning(async () => ({
      status: 204,
      statusText: '',
      headers: {},
      body: new ArrayBuffer(0),
    }))
    const res = await createBridgeFetch(bridge)('http://localhost:50021/version')
    expect(res.status).toBe(204)
  })

  test('bridge の失敗は TypeError になる', async () => {
    const { bridge } = bridgeReturning(async () => {
      throw new Error("Error invoking remote method 'engine:fetch': net::ERR_CONNECTION_REFUSED")
    })
    await expect(createBridgeFetch(bridge)('http://localhost:50021/version')).rejects.toBeInstanceOf(TypeError)
  })

  test('VoicevoxClient に通すと unreachable になる', async () => {
    const { bridge } = bridgeReturning(async () => {
      throw new Error('ECONNREFUSED')
    })
    const client = new VoicevoxClient({ baseUrl: 'http://localhost:50021', fetch: createBridgeFetch(bridge) })
    const err = await client.version().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(VoicevoxError)
    expect((err as VoicevoxError).kind).toBe('unreachable')
  })

  test('VoicevoxClient のタイムアウトは timeout になる（bridge が返らなくても）', async () => {
    const { bridge } = bridgeReturning(() => new Promise<EngineResponse>(() => {}))
    const client = new VoicevoxClient({
      baseUrl: 'http://localhost:50021',
      timeoutMs: 20,
      fetch: createBridgeFetch(bridge),
    })
    const err = await client.version().catch((e: unknown) => e)
    expect((err as VoicevoxError).kind).toBe('timeout')
  })

  test('signal を abort すると bridge が返る前でも AbortError で reject', async () => {
    const { bridge } = bridgeReturning(() => new Promise<EngineResponse>(() => {}))
    const controller = new AbortController()
    const p = createBridgeFetch(bridge)('http://localhost:50021/version', { signal: controller.signal })
    controller.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('すでに abort 済みの signal なら bridge を呼ばない', async () => {
    const { bridge, engineFetch } = bridgeReturning(async () => ok(''))
    const controller = new AbortController()
    controller.abort()
    await expect(
      createBridgeFetch(bridge)('http://localhost:50021/version', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(engineFetch).not.toHaveBeenCalled()
  })

  test('文字列の本文と Headers を Record<string,string> にして渡す', async () => {
    const { bridge, engineFetch } = bridgeReturning(async () => ok('[]'))
    await createBridgeFetch(bridge)('http://localhost:50021/mora_data?speaker=3', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: '[1,2]',
    })
    expect(engineFetch).toHaveBeenCalledWith({
      url: 'http://localhost:50021/mora_data?speaker=3',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[1,2]',
    })
  })

  test('plain object の headers も同じ形で渡し、GET では body を渡さない', async () => {
    const { bridge, engineFetch } = bridgeReturning(async () => ok('"0.25.0"'))
    await createBridgeFetch(bridge)('http://localhost:50021/version', { headers: { Accept: 'application/json' } })
    const sent = engineFetch.mock.calls[0][0]
    expect(sent).toEqual({
      url: 'http://localhost:50021/version',
      method: 'GET',
      headers: { accept: 'application/json' },
    })
    expect('body' in sent).toBe(false)
  })

  test('Request オブジェクトや URL を入力にしても動く', async () => {
    const { bridge, engineFetch } = bridgeReturning(async () => ok('[]'))
    const f = createBridgeFetch(bridge)
    await f(new URL('http://localhost:50021/speakers'))
    await f(new Request('http://localhost:50021/synthesis?speaker=1', { method: 'POST', body: '{}' }))
    expect(engineFetch.mock.calls[0][0].url).toBe('http://localhost:50021/speakers')
    expect(engineFetch.mock.calls[1][0]).toMatchObject({ method: 'POST', body: '{}' })
  })
})
