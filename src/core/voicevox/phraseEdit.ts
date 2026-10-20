import { VoicevoxError } from './client'
import type { VoicevoxClient } from './client'
import { mergeMoraData } from './tuning'
import type { AccentPhrase, Mora } from './types'

// アクセント句の編集。どれも新しい配列を返し、受け取った配列は変えない。
// 範囲は VOICEVOX エディタに合わせる。

export const MORA_PITCH_RANGE = { min: 3, max: 6.5, step: 0.01 } as const
export const MORA_LENGTH_RANGE = { min: 0, max: 0.3, step: 0.01 } as const
export const PAUSE_LENGTH_RANGE = { min: 0, max: 1, step: 0.01 } as const

const clamp = (v: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, v))

function clampAccent(accent: number, moraCount: number): number {
  return Math.min(moraCount, Math.max(1, Math.round(accent)))
}

/** phraseIndex の句だけを fn で作り直す */
function mapPhrase(phrases: AccentPhrase[], phraseIndex: number, fn: (p: AccentPhrase) => AccentPhrase): AccentPhrase[] {
  return phrases.map((p, i) => (i === phraseIndex ? fn(structuredClone(p)) : structuredClone(p)))
}

function mapMora(
  phrases: AccentPhrase[],
  phraseIndex: number,
  moraIndex: number,
  fn: (m: Mora) => Mora,
): AccentPhrase[] {
  return mapPhrase(phrases, phraseIndex, (p) => ({ ...p, moras: p.moras.map((m, i) => (i === moraIndex ? fn(m) : m)) }))
}

/** アクセント（下がる位置。1 始まり）を 1〜モーラ数に丸めて変える */
export function setAccent(phrases: AccentPhrase[], phraseIndex: number, accent: number): AccentPhrase[] {
  if (!Number.isFinite(accent)) return structuredClone(phrases)
  return mapPhrase(phrases, phraseIndex, (p) => ({ ...p, accent: clampAccent(accent, p.moras.length) }))
}

/**
 * moraIndex のモーラの前で句を2つに分ける。後ろの無音と疑問形は後半が引き継ぐ。
 * 端で分けようとしたら何もしない。
 */
export function splitPhrase(phrases: AccentPhrase[], phraseIndex: number, moraIndex: number): AccentPhrase[] {
  const target = phrases[phraseIndex]
  if (!target || moraIndex <= 0 || moraIndex >= target.moras.length) return structuredClone(phrases)
  const p = structuredClone(target)
  const head = p.moras.slice(0, moraIndex)
  const tail = p.moras.slice(moraIndex)
  const first: AccentPhrase = { ...p, moras: head, accent: clampAccent(p.accent, head.length), pause_mora: null, is_interrogative: false }
  const second: AccentPhrase = { ...p, moras: tail, accent: clampAccent(p.accent, tail.length) }
  return [
    ...structuredClone(phrases.slice(0, phraseIndex)),
    first,
    second,
    ...structuredClone(phrases.slice(phraseIndex + 1)),
  ]
}

/** phraseIndex の句と次の句をつなぐ。アクセントは前の句、後ろの無音と疑問形は後ろの句のもの */
export function joinPhrases(phrases: AccentPhrase[], phraseIndex: number): AccentPhrase[] {
  const a = phrases[phraseIndex]
  const b = phrases[phraseIndex + 1]
  if (!a || !b) return structuredClone(phrases)
  const joined: AccentPhrase = {
    ...structuredClone(b),
    moras: structuredClone([...a.moras, ...b.moras]),
    accent: a.accent,
  }
  return [
    ...structuredClone(phrases.slice(0, phraseIndex)),
    joined,
    ...structuredClone(phrases.slice(phraseIndex + 2)),
  ]
}

/** モーラの高さ。無声のモーラ（高さ 0）は変えない */
export function setMoraPitch(phrases: AccentPhrase[], phraseIndex: number, moraIndex: number, pitch: number): AccentPhrase[] {
  if (!Number.isFinite(pitch)) return structuredClone(phrases)
  return mapMora(phrases, phraseIndex, moraIndex, (m) => (m.pitch === 0 ? m : { ...m, pitch: clamp(pitch, MORA_PITCH_RANGE) }))
}

/** 子音または母音の長さ（秒）。子音のないモーラの子音の長さは変えない */
export function setMoraLength(
  phrases: AccentPhrase[],
  phraseIndex: number,
  moraIndex: number,
  part: 'consonant' | 'vowel',
  seconds: number,
): AccentPhrase[] {
  if (!Number.isFinite(seconds)) return structuredClone(phrases)
  const v = clamp(seconds, MORA_LENGTH_RANGE)
  return mapMora(phrases, phraseIndex, moraIndex, (m) => {
    if (part === 'vowel') return { ...m, vowel_length: v }
    return m.consonant === null || m.consonant_length === null ? m : { ...m, consonant_length: v }
  })
}

/** 句の後ろの無音（秒）。無音のない句は変えない */
export function setPauseLength(phrases: AccentPhrase[], phraseIndex: number, seconds: number): AccentPhrase[] {
  if (!Number.isFinite(seconds)) return structuredClone(phrases)
  return mapPhrase(phrases, phraseIndex, (p) =>
    p.pause_mora ? { ...p, pause_mora: { ...p.pause_mora, vowel_length: clamp(seconds, PAUSE_LENGTH_RANGE) } } : p,
  )
}

/**
 * changed の句だけ高さと長さを取り直す。前後の文脈で高さが変わるので全部の句を送り、
 * それ以外の句（手で変えた値を含む）は元のまま残す。
 */
export async function refetchPhrases(
  client: Pick<VoicevoxClient, 'moraData'>,
  phrases: AccentPhrase[],
  changed: number[],
  styleId: number,
): Promise<AccentPhrase[]> {
  const fetched = await client.moraData(phrases, styleId)
  return mergeMoraData(phrases, fetched, changed)
}

// ---- 読み ----

/** 前のモーラにくっつく小さいかな（キャ・ヴァ・クヮ など）。ッ・ン・ー は1モーラ */
const SMALL_KANA = new Set('ァィゥェォャュョヮ')

// エンジンのかな表記（AquesTalk 風）は「ー」を受け付けないので、前のかなの母音に直す
const VOWEL_OF: Record<string, string> = {}
for (const [vowel, kana] of [
  ['ア', 'アカガサザタダナハバパマヤラワァャヮ'],
  ['イ', 'イキギシジチヂニヒビピミリィヰ'],
  ['ウ', 'ウクグスズツヅヌフブプムユルゥュヴ'],
  ['エ', 'エケゲセゼテデネヘベペメレェヱヶ'],
  ['オ', 'オコゴソゾトドノホボポモヨロヲォョ'],
] as const) {
  for (const k of kana) VOWEL_OF[k] = vowel
}

/** ひらがなをカタカナにし、空白と記号（アクセント・区切り・疑問符など）を除き、ー を母音に直す */
function normalizeReading(reading: string): string {
  const kata = reading
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s'’/／、，,。．.？?！!_＿]/g, '')
  let out = ''
  for (const c of kata) {
    // 前が母音に直せないかな（ン・ッ など）なら、ー のまま送ってエンジンに知らせてもらう
    out += c === 'ー' ? (VOWEL_OF[out.at(-1) ?? ''] ?? c) : c
  }
  return out
}

function splitMoras(kana: string): string[] {
  const moras: string[] = []
  for (const c of kana) {
    if (SMALL_KANA.has(c) && moras.length > 0) moras[moras.length - 1] += c
    else moras.push(c)
  }
  return moras
}

/** カタカナの読みのモーラ数 */
export function moraCount(reading: string): number {
  return splitMoras(normalizeReading(reading)).length
}

/**
 * 読みをエンジンのかな表記にする。元の句のアクセント（モーラ数を超えたら最後）の後ろに ' を置き、
 * 疑問形なら末尾に ？ を付ける。
 */
export function kanaWithAccent(phrase: AccentPhrase, reading: string): string {
  const moras = splitMoras(normalizeReading(reading))
  if (moras.length === 0) return ''
  const accent = clampAccent(phrase.accent, moras.length)
  return `${moras.slice(0, accent).join('')}'${moras.slice(accent).join('')}${phrase.is_interrogative ? '？' : ''}`
}

/**
 * phraseIndex の句の読みを変える。エンジンが返した句（複数でもよい）で差し替え、差し替えた句だけ
 * 取り直す。元の句の後ろの無音は最後の句に残す。エンジンのエラーはそのまま投げる。
 */
export async function replaceReading(
  client: Pick<VoicevoxClient, 'accentPhrases' | 'moraData'>,
  phrases: AccentPhrase[],
  phraseIndex: number,
  reading: string,
  styleId: number,
): Promise<AccentPhrase[]> {
  const original = phrases[phraseIndex]
  if (!original) throw new RangeError(`アクセント句がありません: ${phraseIndex}`)
  const kana = kanaWithAccent(original, reading)
  if (kana === '') throw new Error('読みを入力してください')
  const replaced = await client.accentPhrases(kana, styleId, true)
  if (replaced.length === 0 || !replaced.every((p) => Array.isArray(p?.moras) && p.moras.length > 0)) {
    throw new VoicevoxError('invalid-response', 'VOICEVOX エンジンが読みからアクセント句を作れませんでした')
  }
  // 複数の句が返るのは normalizeReading が句の区切り（、や /）を残す場合だけ。今は残さないので通らない
  const lastIndex = replaced.length - 1
  const fresh = replaced.map((p, i) => ({
    ...structuredClone(p),
    pause_mora: structuredClone(p.pause_mora ?? (i === lastIndex ? original.pause_mora : null)),
  }))
  const spliced = [
    ...structuredClone(phrases.slice(0, phraseIndex)),
    ...fresh,
    ...structuredClone(phrases.slice(phraseIndex + 1)),
  ]
  const changed = replaced.map((_, i) => phraseIndex + i)
  return refetchPhrases(client, spliced, changed, styleId)
}
