// 実エンジンで buildMouthTimeline の duration と合成 WAV の長さを照合する。
// 使い方: VOICEVOX_URL=http://localhost:50021 npx tsx scripts/check-timeline.ts
import { buildMouthTimeline } from '../src/core/lipsync/timeline'
import type { AudioQuery } from '../src/core/voicevox/types'

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
  if (failures > 0) {
    console.log(`${failures} case(s) exceeded ${TOLERANCE_SEC.toFixed(4)}s`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
