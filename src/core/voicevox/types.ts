// VOICEVOX エンジンの JSON のキー名のまま（snake_case / camelCase 混在を保つ）。

export interface Mora {
  text: string
  consonant: string | null
  consonant_length: number | null
  vowel: string
  vowel_length: number
  pitch: number
}

export interface AccentPhrase {
  moras: Mora[]
  accent: number
  pause_mora: Mora | null
  is_interrogative?: boolean
}

export interface AudioQuery {
  accent_phrases: AccentPhrase[]
  speedScale: number
  pitchScale: number
  intonationScale: number
  volumeScale: number
  prePhonemeLength: number
  postPhonemeLength: number
  pauseLength?: number | null
  pauseLengthScale?: number
  outputSamplingRate: number
  outputStereo: boolean
  kana?: string
}

export interface SpeakerStyle {
  name: string
  id: number
}

export interface Speaker {
  name: string
  speaker_uuid: string
  styles: SpeakerStyle[]
}
