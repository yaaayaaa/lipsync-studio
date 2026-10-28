import { unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import type { ScriptLine } from '../../../src/core/character/types'
import { exportLines, zipResults } from '../../../src/core/export/exportAll'
import type { LineResult } from '../../../src/core/export/exportAll'
import { VoicevoxError } from '../../../src/core/voicevox/client'

const line = (id: string, text: string): ScriptLine => ({
  id,
  text,
  characterId: 'c1',
  expressionId: 'e1',
  speedScale: 1,
})

const lines = [line('l1', 'いち'), line('l2', 'に'), line('l3', 'さん')]

const bytes = (s: string) => new TextEncoder().encode(s)

// 2行目だけ VOICEVOX に接続できずに失敗する renderOne
const renderOne = async (l: ScriptLine, index: number) => {
  if (l.id === 'l2') throw new VoicevoxError('unreachable', 'VOICEVOX エンジンに接続できません (http://localhost:50021)')
  return { fileName: `${String(index + 1).padStart(3, '0')}_${l.text}.mp4`, blob: new Blob([bytes(`mp4:${l.text}`)]) }
}

describe('exportLines', () => {
  it('keeps going after a failed line and reports each line in order', async () => {
    const done: LineResult[] = []
    const results = await exportLines(lines, renderOne, (r) => done.push(r))

    expect(results.map((r) => [r.lineId, r.ok])).toEqual([
      ['l1', true],
      ['l2', false],
      ['l3', true],
    ])
    const failed = results[1]!
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error).toContain('VOICEVOX')
    expect(done).toEqual(results)
  })

  it('renders lines one at a time with their script index', async () => {
    let running = 0
    let maxRunning = 0
    const seen: number[] = []
    await exportLines(lines, async (l, index) => {
      running++
      maxRunning = Math.max(maxRunning, running)
      seen.push(index)
      await new Promise((r) => setTimeout(r, 1))
      running--
      return { fileName: `${l.id}.mp4`, blob: new Blob([]) }
    })
    expect(maxRunning).toBe(1)
    expect(seen).toEqual([0, 1, 2])
  })

  it('stops at an abort instead of recording it as a failed line', async () => {
    const render = vi.fn(async (l: ScriptLine) => {
      if (l.id === 'l2') throw new DOMException('書き出しを中止しました', 'AbortError')
      return { fileName: `${l.id}.mp4`, blob: new Blob([]) }
    })
    await expect(exportLines(lines, render)).rejects.toMatchObject({ name: 'AbortError' })
    expect(render).toHaveBeenCalledTimes(2)
  })
})

const ZIP_HEADERS: Record<number, { kind: string; flag: number; nameLength: number; name: number }> = {
  0x04034b50: { kind: 'local', flag: 6, nameLength: 26, name: 30 },
  0x02014b50: { kind: 'central', flag: 8, nameLength: 28, name: 46 },
}

describe('zipResults', () => {
  it('stores only the successful files, with their names and contents', async () => {
    const results = await exportLines(lines, renderOne)
    const zip = await zipResults(results)
    expect(zip.type).toBe('application/zip')

    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual(['001_いち.mp4', '003_さん.mp4'])
    expect(new TextDecoder().decode(files['001_いち.mp4'])).toBe('mp4:いち')
    expect(new TextDecoder().decode(files['003_さん.mp4'])).toBe('mp4:さん')
  })

  // 汎用フラグの bit 11（0x0800）が立っていないと、展開する側は名前を UTF-8 ではなく
  // CP437 や Shift_JIS として読み、日本語の名前が化ける
  it('marks every entry name as UTF-8 (general purpose bit 11)', async () => {
    const results = await exportLines(lines, renderOne)
    const bytes = new Uint8Array(await (await zipResults(results)).arrayBuffer())
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const flags: { kind: string; name: string; utf8: boolean }[] = []
    for (let i = 0; i + 4 <= bytes.length; i++) {
      const sig = view.getUint32(i, true)
      // ローカルヘッダーと中央ディレクトリで、フラグ・名前の長さ・名前の位置が違う
      const layout = ZIP_HEADERS[sig]
      if (!layout) continue
      const nameLength = view.getUint16(i + layout.nameLength, true)
      const name = new TextDecoder().decode(bytes.subarray(i + layout.name, i + layout.name + nameLength))
      flags.push({ kind: layout.kind, name, utf8: (view.getUint16(i + layout.flag, true) & 0x0800) !== 0 })
    }
    expect(flags.map((f) => `${f.kind}:${f.name}`).sort()).toEqual([
      'central:001_いち.mp4',
      'central:003_さん.mp4',
      'local:001_いち.mp4',
      'local:003_さん.mp4',
    ])
    expect(flags.every((f) => f.utf8)).toBe(true)
  })
})
