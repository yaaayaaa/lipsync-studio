import { zipSync } from 'fflate'
import type { Zippable } from 'fflate'
import type { ScriptLine } from '../character/types'

export type LineResult =
  | { lineId: string; ok: true; fileName: string; blob: Blob }
  | { lineId: string; ok: false; error: string }

export type RenderOne = (line: ScriptLine, index: number) => Promise<{ fileName: string; blob: Blob }>

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/**
 * 行を1本ずつ順に書き出す（並列にしないのはメモリを抑えるため）。
 * 1行の失敗は記録して次の行へ進む。中止（AbortError）だけは残りを書き出さずに投げ直す。
 * renderOne の index は lines の中の位置（ファイル名の連番に使う）。
 */
export async function exportLines(
  lines: ScriptLine[],
  renderOne: RenderOne,
  onLineDone?: (r: LineResult) => void,
): Promise<LineResult[]> {
  const results: LineResult[] = []
  for (const [index, line] of lines.entries()) {
    let result: LineResult
    try {
      const { fileName, blob } = await renderOne(line, index)
      result = { lineId: line.id, ok: true, fileName, blob }
    } catch (e) {
      if (isAbort(e)) throw e
      result = { lineId: line.id, ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    results.push(result)
    onLineDone?.(result)
  }
  return results
}

/** 成功した行だけを無圧縮（mp4 は圧縮済みなので level 0）の zip にまとめる。 */
export async function zipResults(results: LineResult[]): Promise<Blob> {
  const files: Zippable = {}
  for (const r of results) {
    if (r.ok) files[r.fileName] = new Uint8Array(await r.blob.arrayBuffer())
  }
  const zipped = zipSync(files, { level: 0 })
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}
