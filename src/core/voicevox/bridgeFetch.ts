import type { DesktopBridge, EngineRequest } from '../../../electron/engineTypes'

// 本文を持てないステータス。new Response に本文を渡すと例外になる
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304])

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('This operation was aborted', 'AbortError')
}

/**
 * デスクトップ版で、エンジンへの通信を main プロセス経由にする fetch。
 * renderer（app://）から直接叩くと、初期設定のエンジンは CORS で app:// を通さないため。
 * VoicevoxClient が本物の fetch と同じように振る舞えるよう、失敗はすべて TypeError
 * （= 接続できません）、signal の abort は AbortError（= タイムアウトの判定に使う）にそろえる。
 */
export function createBridgeFetch(bridge: DesktopBridge): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    // Request に移した signal は別物になり reason が変わりうるので、渡された方を優先して見る
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    if (signal?.aborted) throw abortReason(signal)

    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'POST') {
      throw new TypeError(`デスクトップ版のエンジン通信は GET/POST だけに対応しています (${method})`)
    }
    const req: EngineRequest = { url: request.url, method, headers: Object.fromEntries(request.headers) }
    if (method === 'POST') req.body = await request.text()

    const pending = bridge.engineFetch(req).catch((e: unknown) => {
      throw new TypeError(`VOICEVOX エンジンとの通信に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    })
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      if (!signal) return
      onAbort = () => reject(abortReason(signal))
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      const res = await Promise.race([pending, aborted])
      return new Response(NULL_BODY_STATUSES.has(res.status) ? null : res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      })
    } finally {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort)
    }
  }
}
