import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Character } from '../core/character/types'
import { openStore } from '../core/storage/db'
import type { AppSettings, Store } from '../core/storage/db'
import { createBridgeFetch } from '../core/voicevox/bridgeFetch'
import { VoicevoxClient } from '../core/voicevox/client'
import { SpeechCache } from '../core/voicevox/speechCache'
import { AppContext } from './useApp'
import type { AppContextValue } from './useApp'

interface Loaded {
  store: Store
  settings: AppSettings
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const store = await openStore()
      const [settings, list] = await Promise.all([store.loadSettings(), store.listCharacters()])
      if (cancelled) return
      setCharacters(list)
      setLoaded({ store, settings })
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const store = loaded?.store
  const reloadCharacters = useCallback(async () => {
    if (!store) return
    setCharacters(await store.listCharacters())
  }, [store])

  const saveCharacter = useCallback(
    async (c: Character, psd?: Blob) => {
      if (!store) throw new Error('保存先がまだ開かれていません')
      setCharacters((prev) => {
        const i = prev.findIndex((p) => p.id === c.id)
        return i < 0 ? [...prev, c] : prev.map((p) => (p.id === c.id ? c : p))
      })
      try {
        await store.saveCharacter(c, psd)
      } catch (e) {
        await reloadCharacters()
        throw e
      }
    },
    [store, reloadCharacters],
  )

  const saveSettings = useCallback(
    async (settings: AppSettings) => {
      if (!store) throw new Error('保存先がまだ開かれていません')
      setLoaded((prev) => prev && { ...prev, settings })
      try {
        await store.saveSettings(settings)
      } catch (e) {
        const saved = await store.loadSettings()
        setLoaded((prev) => prev && { ...prev, settings: saved })
        throw e
      }
    },
    [store],
  )

  const engineUrl = loaded?.settings.engineUrl
  // デスクトップ版では main プロセス経由で通信する（CORS で app:// が弾かれるため）。
  // ブラウザでの開発時（npm run dev）は窓口が無いので、今までどおり直接 fetch する
  const client = useMemo(() => {
    if (!engineUrl) return null
    const desktop = window.lipsyncDesktop
    return new VoicevoxClient({ baseUrl: engineUrl, fetch: desktop ? createBridgeFetch(desktop) : undefined })
  }, [engineUrl])
  // 合成結果はエンジンごとに別物なので、client と一緒に作り直す
  const speech = useMemo(() => (client ? SpeechCache.forClient(client) : null), [client])

  const value = useMemo<AppContextValue | null>(
    () =>
      loaded && client && speech
        ? {
            store: loaded.store,
            settings: loaded.settings,
            client,
            speech,
            characters,
            reloadCharacters,
            saveCharacter,
            saveSettings,
          }
        : null,
    [loaded, client, speech, characters, reloadCharacters, saveCharacter, saveSettings],
  )

  if (error) return <p className="app-message error">保存領域（IndexedDB）を開けませんでした: {error}</p>
  if (!value) return <p className="app-message">読み込み中…</p>
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
