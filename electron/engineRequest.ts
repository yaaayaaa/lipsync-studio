import type { EngineRequest } from './engineTypes'

// renderer から main に頼めるのは VOICEVOX エンジンの API のうちアプリが使うものだけ。
// main の net.fetch は CORS もオリジンの制限も受けないので、ここを広げると
// renderer が乗っ取られたときに任意の HTTP 送信の踏み台になる
const ALLOWED_PATHS = ['/version', '/speakers', '/audio_query', '/accent_phrases', '/mora_data', '/synthesis']
const ALLOWED_METHODS = new Set(['GET', 'POST'])

export function isAllowedEngineRequest(req: EngineRequest): boolean {
  if (!ALLOWED_METHODS.has(req.method)) return false
  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  // pathname は URL の正規化（.. の解決）を済ませた値なので、それで判定する
  const api = ALLOWED_PATHS.find((p) => url.pathname.endsWith(p))
  if (api === undefined) return false
  return isCleanBasePath(url.pathname.slice(0, -api.length))
}

/**
 * エンジンの URL に付いたパス（リバースプロキシの下に置いた http://host/voicevox など）として正しいか。
 * 空（パスなし）か、/ で始まり、空・. ・.. の区切りがなく、エンコードした区切り文字（%2F・%5C）も
 * 含まないものだけを認める。renderer の client は「末尾の / を落とした URL + API のパス」で組み立てるので、
 * それ以外の形の前置きは正しい設定からは来ない
 */
function isCleanBasePath(prefix: string): boolean {
  if (prefix === '') return true
  if (!prefix.startsWith('/')) return false
  if (/%(2f|5c)/i.test(prefix) || prefix.includes('\\')) return false
  return prefix
    .slice(1)
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..' && !/^(%2e|\.){1,2}$/i.test(segment))
}

/**
 * IPC で届いた値は renderer の言い分でしかないので、型どおりの形かを確かめてから使う。
 * 形が違えば null。余計なフィールドは落として、使う分だけの新しいオブジェクトにする。
 */
export function parseEngineRequest(raw: unknown): EngineRequest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { url, method, headers, body } = raw as Record<string, unknown>
  if (typeof url !== 'string') return null
  if (method !== 'GET' && method !== 'POST') return null
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) return null
  const plainHeaders: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v !== 'string') return null
    plainHeaders[k] = v
  }
  if (body !== undefined && (typeof body !== 'string' || method === 'GET')) return null
  return body === undefined ? { url, method, headers: plainHeaders } : { url, method, headers: plainHeaders, body }
}
