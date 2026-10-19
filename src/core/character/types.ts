import type { LayerId, VisibilityState } from '../psd/types'

export type Vowel = 'a' | 'i' | 'u' | 'e' | 'o' | 'closed'

export const VOWELS: readonly Vowel[] = ['a', 'i', 'u', 'e', 'o', 'closed']

export type MouthMap = Partial<Record<Vowel, LayerId>>

export interface Expression {
  id: string
  name: string
  visibility: VisibilityState
}

export interface VoiceRef {
  styleId: number
  speakerName: string
  styleName: string
}

export interface Character {
  id: string
  name: string
  psdFileName: string
  voice: VoiceRef | null
  mouthGroupId: LayerId | null
  mouthMap: MouthMap
  expressions: Expression[]
}

export interface ScriptLine {
  id: string
  text: string
  characterId: string | null
  expressionId: string | null
  speedScale: number
}

export interface ExportSettings {
  width: number
  height: number
  /** 立ち絵の高さ ÷ 動画の高さ */
  scale: number
  background: string
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  width: 1920,
  height: 1080,
  scale: 0.9,
  background: '#00FF00',
}
