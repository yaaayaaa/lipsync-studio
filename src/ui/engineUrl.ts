/** http(s) の URL だけを受け付け、末尾の / を落とす。不正なら null。 */
export function normalizeEngineUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.search || url.hash) return null
  return url.href.replace(/\/+$/, '')
}
