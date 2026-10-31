// 口のタイムラインと瞬きの位置を JSON で出す（アプリの外から使う。エンジンには問い合わせない）。
// 使い方: npx tsx scripts/mouth-timeline.ts [--fps 30] < requests.json > timelines.json
//   requests.json: [{ "id": "line-1", "query": <audio_query の結果（/synthesis に渡したもの）> }, ...]
//   出力: [{ "id", "segments": [{ "start", "end", "vowel" }], "duration", "blinkStarts": [フレーム] }, ...]
import { buildTimelines, type TimelineRequest } from '../src/core/lipsync/batch'

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

async function main() {
  const i = process.argv.indexOf('--fps')
  const fps = i >= 0 ? Number(process.argv[i + 1]) : 30
  const requests = JSON.parse(await readStdin()) as TimelineRequest[]
  if (!Array.isArray(requests)) throw new Error('入力は [{ id, query }] の配列')
  process.stdout.write(JSON.stringify(buildTimelines(requests, fps)))
}

main().catch((e) => {
  process.stderr.write(`mouth-timeline: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
