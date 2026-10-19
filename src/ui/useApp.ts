import { createContext, useContext } from 'react'
import type { Character } from '../core/character/types'
import type { AppSettings, Store } from '../core/storage/db'
import type { VoicevoxClient } from '../core/voicevox/client'

export interface AppContextValue {
  store: Store
  settings: AppSettings
  client: VoicevoxClient
  characters: Character[]
  reloadCharacters(): Promise<void>
  /** 画面には即座に反映し、IndexedDB に保存する。保存に失敗したら保存済みの内容に戻して例外を投げる。 */
  saveCharacter(c: Character, psd?: Blob): Promise<void>
}

/** 値は AppProvider（AppContext.tsx）が入れる。 */
export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}
