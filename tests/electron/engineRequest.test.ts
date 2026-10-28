import { describe, expect, test } from 'vitest'
import { isAllowedEngineRequest, parseEngineRequest } from '../../electron/engineRequest'
import type { EngineRequest } from '../../electron/engineTypes'

const req = (url: string, method: 'GET' | 'POST' = 'GET'): EngineRequest => ({ url, method, headers: {} })

describe('isAllowedEngineRequest', () => {
  test('エンジンの API パスは通す', () => {
    expect(isAllowedEngineRequest(req('http://localhost:50021/version'))).toBe(true)
    expect(isAllowedEngineRequest(req('http://192.168.1.5:50021/synthesis?speaker=3', 'POST'))).toBe(true)
    expect(isAllowedEngineRequest(req('https://vv.example.com/speakers'))).toBe(true)
    for (const p of ['/audio_query?text=a&speaker=1', '/accent_phrases?text=a', '/mora_data?speaker=1']) {
      expect(isAllowedEngineRequest(req(`http://127.0.0.1:50021${p}`, 'POST'))).toBe(true)
    }
  })
  test('http/https 以外のスキームは拒否', () => {
    expect(isAllowedEngineRequest(req('file:///etc/passwd'))).toBe(false)
    expect(isAllowedEngineRequest(req('app://lipsync-studio/version'))).toBe(false)
  })
  test('許可リストにないパスは拒否', () => {
    expect(isAllowedEngineRequest(req('https://example.com/'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://localhost:50021/setting'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://localhost:50021/version/extra'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://localhost:50021/xversion'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://localhost:50021/voicevox/setting'))).toBe(false)
  })
  // リバースプロキシの下に置いたエンジン（http://host/voicevox など）
  test('エンジンの URL にパスがあっても、その後ろの API のパスは通す', () => {
    expect(isAllowedEngineRequest(req('https://example.com/voicevox/version'))).toBe(true)
    expect(isAllowedEngineRequest(req('http://192.168.1.5/a/b-c_d/synthesis?speaker=3', 'POST'))).toBe(true)
    expect(isAllowedEngineRequest(req('http://h/%E9%9F%B3%E5%A3%B0/speakers'))).toBe(true)
  })
  test('パスの前置きが汚いもの（空の区切り・エンコードした区切り文字）は拒否', () => {
    expect(isAllowedEngineRequest(req('http://h//version'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://h/a//version'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://h/voicevox/'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://h/a%2Fb/version'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://h/a%2fb/version'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://h/a%5Cb/version'))).toBe(false)
    expect(isAllowedEngineRequest(req('http://h/..%2F/version'))).toBe(false)
  })
  test('パスは URL 正規化後で判定する', () => {
    expect(isAllowedEngineRequest(req('http://localhost:50021/../version'))).toBe(true)
    expect(isAllowedEngineRequest(req('http://localhost:50021/x/../setting'))).toBe(false)
  })
  test('GET/POST 以外のメソッドは拒否', () => {
    expect(isAllowedEngineRequest({ ...req('http://localhost:50021/version'), method: 'DELETE' as 'GET' })).toBe(false)
  })
  test('壊れた URL は拒否', () => {
    expect(isAllowedEngineRequest(req('not a url'))).toBe(false)
  })
})

describe('parseEngineRequest', () => {
  test('正しい形はそのまま返す', () => {
    const r = {
      url: 'http://localhost:50021/mora_data',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[]',
    }
    expect(parseEngineRequest(r)).toEqual(r)
    expect(parseEngineRequest({ url: 'http://localhost:50021/version', method: 'GET', headers: {} })).toEqual({
      url: 'http://localhost:50021/version',
      method: 'GET',
      headers: {},
    })
  })
  test('余計なフィールドは落とす', () => {
    expect(parseEngineRequest({ url: 'http://a/version', method: 'GET', headers: {}, extra: 1 })).toEqual({
      url: 'http://a/version',
      method: 'GET',
      headers: {},
    })
  })
  test('形が違うものは null', () => {
    expect(parseEngineRequest(null)).toBeNull()
    expect(parseEngineRequest('http://a/version')).toBeNull()
    expect(parseEngineRequest({ url: 1, method: 'GET', headers: {} })).toBeNull()
    expect(parseEngineRequest({ url: 'http://a/version', method: 'PUT', headers: {} })).toBeNull()
    expect(parseEngineRequest({ url: 'http://a/version', method: 'GET' })).toBeNull()
    expect(parseEngineRequest({ url: 'http://a/version', method: 'GET', headers: [] })).toBeNull()
    expect(parseEngineRequest({ url: 'http://a/version', method: 'GET', headers: { a: 1 } })).toBeNull()
    expect(
      parseEngineRequest({ url: 'http://a/version', method: 'POST', headers: {}, body: new ArrayBuffer(1) }),
    ).toBeNull()
  })
  test('GET に本文があれば null（fetch でも GET に本文は付けられない）', () => {
    expect(parseEngineRequest({ url: 'http://a/version', method: 'GET', headers: {}, body: 'x' })).toBeNull()
  })
})
