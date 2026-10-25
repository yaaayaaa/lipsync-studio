import path from 'node:path'

export const APP_ORIGIN = 'app://lipsync-studio'

/**
 * app://lipsync-studio/<urlPath> を root（dist/ の絶対パス）配下のファイルパスにする。
 * 配信対象を dist/ だけに閉じ込めるため、正規化後に root の外へ出るものは null を返す。
 * Electron を import しないのは、このロジックを Node 上の単体テストで検証するため。
 */
export function resolveAppPath(urlPath: string, root: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const relative = decoded === '' || decoded === '/' ? 'index.html' : decoded
  // 先頭の / だけ落として root からの相対にする。'/' を足して正規化すると .. が根で止まり
  // 逸脱が黙って丸められて検出できなくなるので、相対のまま resolve して外へ出たかを見る
  const resolved = path.resolve(root, relative.replace(/^\/+/, ''))
  const resolvedRoot = path.resolve(root)
  return resolved.startsWith(resolvedRoot + path.sep) ? resolved : null
}

/**
 * ウィンドウ外へ出る URL の扱い。外部ブラウザに渡してよいのは https: だけ
 * （file: や javascript: を OS に渡すと任意実行の入口になる）。
 */
export function decideNavigation(url: string): 'external' | 'ignore' {
  try {
    return new URL(url).protocol === 'https:' ? 'external' : 'ignore'
  } catch {
    return 'ignore'
  }
}
