import { openDB } from 'idb'
import type { DBSchema } from 'idb'
import { resolveMouthLayer } from '../character/mouth'
import { DEFAULT_EXPORT_SETTINGS, VOWELS } from '../character/types'
import { lineVoice } from '../character/voice'
import type { Character, ExportSettings, ScriptLine } from '../character/types'

export interface AppSettings {
  engineUrl: string
  export: ExportSettings
}

export type LineProblem = 'no-character' | 'no-expression' | 'no-voice' | 'no-mouth' | 'empty-text'

export interface Store {
  listCharacters(): Promise<Character[]>
  /** PSD is stored/replaced only when `psd` is given. */
  saveCharacter(c: Character, psd?: Blob): Promise<void>
  loadPsd(characterId: string): Promise<Blob | undefined>
  /** Removes the PSD as well. */
  deleteCharacter(id: string): Promise<void>
  loadScript(): Promise<ScriptLine[]>
  saveScript(lines: ScriptLine[]): Promise<void>
  loadSettings(): Promise<AppSettings>
  saveSettings(s: AppSettings): Promise<void>
}

export const DEFAULT_ENGINE_URL = 'http://localhost:50021'

/**
 * PSDs are stored as bytes + MIME type rather than as a Blob: Blob structured
 * cloning is not reliable in every IndexedDB implementation (e.g. test fakes).
 */
interface StoredPsd {
  type: string
  data: ArrayBuffer
}

interface ZundaDB extends DBSchema {
  characters: { key: string; value: Character }
  psds: { key: string; value: StoredPsd }
  kv: { key: string; value: unknown }
}

const SCRIPT_KEY = 'script'
const SETTINGS_KEY = 'settings'

// 名前は改名前のまま：変えると保存済みのキャラ・台本・設定を読めなくなる
export async function openStore(dbName = 'zunda-lipsync'): Promise<Store> {
  const db = await openDB<ZundaDB>(dbName, 1, {
    upgrade(database) {
      database.createObjectStore('characters', { keyPath: 'id' })
      database.createObjectStore('psds')
      database.createObjectStore('kv')
    },
  })

  return {
    listCharacters: () => db.getAll('characters'),

    async saveCharacter(c, psd) {
      // Read the blob before opening the transaction: awaiting a non-IDB
      // promise inside it would let the transaction auto-commit.
      const stored: StoredPsd | undefined = psd && { type: psd.type, data: await psd.arrayBuffer() }
      const tx = db.transaction(['characters', 'psds'], 'readwrite')
      await Promise.all([
        tx.objectStore('characters').put(c),
        stored ? tx.objectStore('psds').put(stored, c.id) : undefined,
        tx.done,
      ])
    },

    async loadPsd(characterId) {
      const stored = await db.get('psds', characterId)
      return stored && new Blob([stored.data], { type: stored.type })
    },

    async deleteCharacter(id) {
      const tx = db.transaction(['characters', 'psds'], 'readwrite')
      await Promise.all([
        tx.objectStore('characters').delete(id),
        tx.objectStore('psds').delete(id),
        tx.done,
      ])
    },

    async loadScript() {
      return ((await db.get('kv', SCRIPT_KEY)) as ScriptLine[] | undefined) ?? []
    },

    async saveScript(lines) {
      await db.put('kv', lines, SCRIPT_KEY)
    },

    async loadSettings() {
      const saved = (await db.get('kv', SETTINGS_KEY)) as Partial<AppSettings> | undefined
      return {
        engineUrl: saved?.engineUrl ?? DEFAULT_ENGINE_URL,
        export: { ...DEFAULT_EXPORT_SETTINGS, ...saved?.export },
      }
    },

    async saveSettings(s) {
      await db.put('kv', s, SETTINGS_KEY)
    },
  }
}

/** 口グループが未設定、または全母音が未割り当てだと口が動かない。 */
function hasMouth(character: Character): boolean {
  return character.mouthGroupId !== null && VOWELS.some((v) => resolveMouthLayer(character.mouthMap, v) !== null)
}

/** Why a script line cannot be synthesized, or null when it can. */
export function lineProblem(line: ScriptLine, characters: Character[]): LineProblem | null {
  const character = characters.find((c) => c.id === line.characterId)
  if (!character) return 'no-character'
  if (!character.expressions.some((e) => e.id === line.expressionId)) return 'no-expression'
  if (!lineVoice(line, character)) return 'no-voice'
  if (!hasMouth(character)) return 'no-mouth'
  if (line.text.trim() === '') return 'empty-text'
  return null
}
