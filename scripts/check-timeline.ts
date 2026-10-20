// 実エンジンで buildMouthTimeline の duration と合成 WAV の長さを照合する。
// 使い方: VOICEVOX_URL=http://localhost:50021 npx tsx scripts/check-timeline.ts
import { buildMouthTimeline } from '../src/core/lipsync/timeline'
import { VoicevoxClient, prepareQuery } from '../src/core/voicevox/client'
import { joinPhrases, refetchPhrases, splitPhrase } from '../src/core/voicevox/phraseEdit'
import type { AccentPhrase, AudioQuery } from '../src/core/voicevox/types'

const BASE_URL = process.env.VOICEVOX_URL ?? 'http://localhost:50021'
const STYLE_ID = Number(process.env.VOICEVOX_STYLE_ID ?? 3)
const TOLERANCE_SEC = 1 / 30
const TEXTS = [
  'こんにちは、今日はいい天気ですね。',
  'ずんだもんなのだ！ぼくは東北の妖精なのだ。',
  // 疑問形（？）は /synthesis が語尾モーラを足す（enable_interrogative_upspeak 既定 true）ので必ず含める
  'ずんだもんなのだ？',
  '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。',
]
const SPEEDS = [0.5, 1.0, 2.0]

// 1行編集で作る「手で変えたクエリ」。pause_mora のある文（読点で句が分かれる）を使う。
const TUNED_TEXT = 'こんにちは、今日はいい天気ですね。'
const TUNED_SPEEDS = [0.5, 1.0, 2.0]

interface TunedCase {
  name: string
  /** audio_query の結果（と必要ならエンジン）から、手で変えたクエリを作る */
  build: (base: AudioQuery, client: VoicevoxClient) => Promise<AudioQuery>
}

const mapMoras = (phrases: AccentPhrase[], fn: (m: AccentPhrase['moras'][number]) => AccentPhrase['moras'][number]) =>
  phrases.map((p) => ({ ...p, moras: p.moras.map(fn) }))

const TUNED_CASES: TunedCase[] = [
  {
    name: 'consonant/vowel lengths changed',
    build: async (q) => ({
      ...q,
      accent_phrases: mapMoras(q.accent_phrases, (m) => ({
        ...m,
        consonant_length: m.consonant_length === null ? null : 0.12,
        vowel_length: 0.2,
      })),
    }),
  },
  {
    name: 'vowel lengths set to 0',
    build: async (q) => ({ ...q, accent_phrases: mapMoras(q.accent_phrases, (m) => ({ ...m, vowel_length: 0 })) }),
  },
  {
    name: 'pause_mora lengthened to 0.8s',
    build: async (q) => ({
      ...q,
      accent_phrases: q.accent_phrases.map((p) =>
        p.pause_mora ? { ...p, pause_mora: { ...p.pause_mora, vowel_length: 0.8 } } : p,
      ),
    }),
  },
  { name: 'pre/post phoneme length 0.5/0.7', build: async (q) => ({ ...q, prePhonemeLength: 0.5, postPhonemeLength: 0.7 }) },
  { name: 'pre/post phoneme length 0/0', build: async (q) => ({ ...q, prePhonemeLength: 0, postPhonemeLength: 0 }) },
  { name: 'pauseLengthScale 0.5', build: async (q) => ({ ...q, pauseLengthScale: 0.5 }) },
  { name: 'pauseLengthScale 2.0', build: async (q) => ({ ...q, pauseLengthScale: 2 }) },
  {
    name: 'phrase split + /mora_data refetch',
    build: async (q, client) => {
      const first = q.accent_phrases[0]
      if (!first || first.moras.length < 3) throw new Error('first phrase too short to split')
      const split = splitPhrase(q.accent_phrases, 0, 2)
      if (split.length !== q.accent_phrases.length + 1) throw new Error('splitPhrase did not split')
      return { ...q, accent_phrases: await refetchPhrases(client, split, [0, 1], STYLE_ID) }
    },
  },
  {
    name: 'phrase join + /mora_data refetch',
    build: async (q, client) => {
      if (q.accent_phrases.length < 2) throw new Error('need two phrases to join')
      const joined = joinPhrases(q.accent_phrases, 0)
      return { ...q, accent_phrases: await refetchPhrases(client, joined, [0], STYLE_ID) }
    },
  },
]

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, init)
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`)
  return res
}

/** RIFF ヘッダを読んで data チャンクのサイズ ÷ (サンプルレート × blockAlign) を返す。 */
function wavDurationSec(wav: ArrayBuffer): number {
  const view = new DataView(wav)
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(wav, offset, 4))
  if (wav.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a RIFF/WAVE file')
  let sampleRate = 0
  let blockAlign = 0
  for (let pos = 12; pos + 8 <= wav.byteLength; ) {
    const id = tag(pos)
    const size = view.getUint32(pos + 4, true)
    if (id === 'fmt ') {
      sampleRate = view.getUint32(pos + 12, true)
      blockAlign = view.getUint16(pos + 20, true)
    } else if (id === 'data') {
      if (!sampleRate || !blockAlign) throw new Error('data chunk before fmt chunk')
      // ストリーム出力などで size が 0xFFFFFFFF のときは実際の残りバイトを使う
      const bytes = Math.min(size, wav.byteLength - (pos + 8))
      return bytes / (sampleRate * blockAlign)
    }
    pos += 8 + size + (size % 2)
  }
  throw new Error('data chunk not found')
}

async function synthesize(q: AudioQuery): Promise<ArrayBuffer> {
  return (
    await request(`/synthesis?speaker=${STYLE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
    })
  ).arrayBuffer()
}

async function main(): Promise<void> {
  let version: string
  try {
    version = (await (await request('/version')).json()) as string
  } catch (e) {
    console.log(`未照合: engine not reachable at ${BASE_URL} (${e instanceof Error ? e.message : e})`)
    return
  }
  if (String(version).includes('fake')) {
    console.log(`未照合: real VOICEVOX engine not found (version ${version})`)
    return
  }
  console.log(`engine ${version} at ${BASE_URL}, style ${STYLE_ID}`)

  let failures = 0
  for (const text of TEXTS) {
    for (const speed of SPEEDS) {
      const q = (await (
        await request(`/audio_query?text=${encodeURIComponent(text)}&speaker=${STYLE_ID}`, { method: 'POST' })
      ).json()) as AudioQuery
      q.speedScale = speed
      const wav = await (
        await request(`/synthesis?speaker=${STYLE_ID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(q),
        })
      ).arrayBuffer()
      const actual = wavDurationSec(wav)
      const predicted = buildMouthTimeline(q).duration
      const diff = Math.abs(actual - predicted)
      const ok = diff < TOLERANCE_SEC
      if (!ok) failures++
      console.log(
        `${ok ? 'OK ' : 'NG '} speed=${speed} wav=${actual.toFixed(4)}s timeline=${predicted.toFixed(4)}s diff=${(diff * 1000).toFixed(2)}ms  ${text.slice(0, 12)}`,
      )
    }
  }
  let total = TEXTS.length * SPEEDS.length

  // 手で変えたクエリ。prepareQuery 経由（48kHz・モノラル）で合成する。アプリと同じ経路
  const client = new VoicevoxClient({ baseUrl: BASE_URL })
  const baseQuery = await client.audioQuery(TUNED_TEXT, STYLE_ID)
  for (const tuned of TUNED_CASES) {
    for (const speed of TUNED_SPEEDS) {
      total++
      const q = prepareQuery(await tuned.build(structuredClone(baseQuery), client), speed)
      const actual = wavDurationSec(await synthesize(q))
      const predicted = buildMouthTimeline(q).duration
      const diff = Math.abs(actual - predicted)
      const ok = diff < TOLERANCE_SEC
      if (!ok) failures++
      console.log(
        `${ok ? 'OK ' : 'NG '} speed=${speed} wav=${actual.toFixed(4)}s timeline=${predicted.toFixed(4)}s diff=${(diff * 1000).toFixed(2)}ms  [tuned] ${tuned.name}`,
      )
    }
  }
  console.log(`${total - failures}/${total} OK`)
  if (failures > 0) {
    console.log(`${failures} case(s) exceeded ${TOLERANCE_SEC.toFixed(4)}s`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
