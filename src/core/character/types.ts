import type { LayerId, VisibilityState } from '../psd/types'
import type { AccentPhrase } from '../voicevox/types'

/** 口の形。n は「ん」（未設定なら closed と同じ口） */
export type Vowel = 'a' | 'i' | 'u' | 'e' | 'o' | 'n' | 'closed'

export const VOWELS: readonly Vowel[] = ['a', 'i', 'u', 'e', 'o', 'n', 'closed']

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

/**
 * 1 行の作り込み。話速は ScriptLine.speedScale に置くのでここには持たない。
 * 出力サンプリングレート等の合成直前の項目も保存しない（prepareQuery が付ける）。
 */
export interface LineTuning {
  /** 作り込んだ時点のセリフ。違えば古い（isTuningStale） */
  text: string
  styleId: number
  accentPhrases: AccentPhrase[]
  pitchScale: number
  intonationScale: number
  volumeScale: number
  pauseLengthScale: number
  prePhonemeLength: number
  postPhonemeLength: number
}

export interface ScriptLine {
  id: string
  text: string
  characterId: string | null
  expressionId: string | null
  speedScale: number
  /** 喋り終わったあと立ち絵を映し続ける秒数。ない＝書き出し設定の既定を使う（0 も行の値として効く） */
  tailSeconds?: number
  tuning?: LineTuning
}

export interface ExportSettings {
  width: number
  height: number
  /** 立ち絵の高さ ÷ 動画の高さ */
  scale: number
  background: string
  /** 喋り終わったあと立ち絵を映し続ける既定の秒数（行ごとに ScriptLine.tailSeconds で上書きできる） */
  tailSeconds: number
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  width: 1920,
  height: 1080,
  scale: 0.9,
  background: '#00FF00',
  tailSeconds: 0,
}
