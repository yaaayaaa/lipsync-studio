import type { ScriptLine } from '../../core/character/types'

// 1行編集で最後に開いた行。見る人ごとの続きの位置なので、ブラウザ（localStorage）に覚える。
// 読めない・壊れているときは、1行目を開く。

// 頭は改名前の名前のまま：変えると保存済みの状態を読めなくなる
const EDITING_LINE_KEY = 'zunda-lipsync.editingLineId'

type LineStorage = Pick<Storage, 'getItem' | 'setItem'>

/** 開く行：覚えている行がまだあればそれ、なければ（消した・初めて）1行目。行がなければ null */
export function resolveEditingLine(lines: readonly ScriptLine[] | null, openedId: string | null): string | null {
  if (!lines || lines.length === 0) return null
  if (openedId !== null && lines.some((l) => l.id === openedId)) return openedId
  return lines[0]!.id
}

export function loadEditingLine(storage: LineStorage = localStorage): string | null {
  try {
    return storage.getItem(EDITING_LINE_KEY)
  } catch {
    return null
  }
}

/** 覚えられなくても（プライベートモードなど）、今開いている画面ではその行のまま */
export function saveEditingLine(lineId: string, storage: LineStorage = localStorage): void {
  try {
    storage.setItem(EDITING_LINE_KEY, lineId)
  } catch {
    // 次に開いたときは1行目になるだけ
  }
}
