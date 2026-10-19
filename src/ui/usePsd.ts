import { readPsd } from 'ag-psd'
import { useEffect, useState } from 'react'
import { buildLayerTree } from '../core/psd/layerTree'
import type { LayerNode } from '../core/psd/types'
import type { Store } from '../core/storage/db'
import { useApp } from './useApp'

export interface PsdSize {
  width: number
  height: number
}

export interface ParsedPsd {
  tree: LayerNode[]
  psdSize: PsdSize
}

export interface PsdState {
  tree: LayerNode[]
  psdSize: PsdSize
  status: 'loading' | 'ready' | 'error'
  error?: string
}

// 解析結果（レイヤーごとの canvas を含む）はキャラ ID ごとにメモリに置く。PSD の解析は重いため。
const cache = new Map<string, Promise<ParsedPsd>>()

/** 失敗したら例外を投げる。メインスレッドを止めるので、呼ぶ前に「読み込み中」を描画しておくこと。 */
export function parsePsd(buffer: ArrayBuffer): ParsedPsd {
  // 合成済み画像とサムネイルは使わないので読まない（メモリ節約）。
  const psd = readPsd(buffer, { skipCompositeImageData: true, skipThumbnail: true })
  return { tree: buildLayerTree(psd.children ?? []), psdSize: { width: psd.width, height: psd.height } }
}

/** 追加直後のキャラの解析結果を登録し、usePsd で再解析しないようにする。 */
export function cachePsd(characterId: string, parsed: ParsedPsd): void {
  cache.set(characterId, Promise.resolve(parsed))
}

export function forgetPsd(characterId: string): void {
  cache.delete(characterId)
}

/** 描画を1回挟んでから重い処理を始める（「読み込み中」を先に表示するため）。 */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}

/** キャッシュにあればそれを、なければ保存済みの PSD を解析して返す（フックの外からも使う）。 */
export function loadParsedPsd(store: Store, characterId: string): Promise<ParsedPsd> {
  let pending = cache.get(characterId)
  if (!pending) {
    pending = (async () => {
      const blob = await store.loadPsd(characterId)
      if (!blob) throw new Error('保存された PSD が見つかりません')
      const buffer = await blob.arrayBuffer()
      await afterPaint()
      return parsePsd(buffer)
    })()
    cache.set(characterId, pending)
    // 失敗は覚えておかない（次に開いたときに再試行する）
    pending.catch(() => cache.delete(characterId))
  }
  return pending
}

const EMPTY_SIZE: PsdSize = { width: 0, height: 0 }

export function usePsd(characterId: string): PsdState {
  const { store } = useApp()
  const [state, setState] = useState<PsdState & { id: string }>({
    id: characterId,
    tree: [],
    psdSize: EMPTY_SIZE,
    status: 'loading',
  })

  useEffect(() => {
    let cancelled = false
    loadParsedPsd(store, characterId).then(
      (parsed) => {
        if (!cancelled) setState({ id: characterId, ...parsed, status: 'ready' })
      },
      (e: unknown) => {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setState({ id: characterId, tree: [], psdSize: EMPTY_SIZE, status: 'error', error: message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [characterId, store])

  // キャラが切り替わった直後の描画では、前のキャラの結果を返さない
  if (state.id !== characterId) return { tree: [], psdSize: EMPTY_SIZE, status: 'loading' }
  const { id: _id, ...rest } = state
  return rest
}
