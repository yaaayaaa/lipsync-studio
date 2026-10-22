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
})
