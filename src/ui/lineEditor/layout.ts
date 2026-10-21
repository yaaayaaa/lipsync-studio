// 1行編集のパネルの大きさ。見る人・画面ごとの好みなので、IndexedDB の設定ではなくブラウザ（localStorage）に覚える。
// 読めない・壊れているときは既定の大きさで動く。

export interface LineEditorLayout {
  /** 左の行の一覧の幅（px） */
  listWidth: number
  /** アクセント・高さ・長さの句の枠の高さ（px）。残りの高さはプレビューが使う */
  phraseHeight: number
}

export const DEFAULT_LAYOUT: LineEditorLayout = { listWidth: 220, phraseHeight: 176 }
export const LIST_WIDTH_RANGE = { min: 140, max: 480 }
/** 句の枠の高さの下限。これより低いと、つまみや文字が重なる */
export const PHRASE_HEIGHT_MIN = 120

const LAYOUT_KEY = 'zunda-lipsync.lineEditorLayout'

type LayoutStorage = Pick<Storage, 'getItem' | 'setItem'>

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function loadLayout(storage: LayoutStorage = localStorage): LineEditorLayout {
  try {
    const saved: unknown = JSON.parse(storage.getItem(LAYOUT_KEY) ?? 'null')
    if (typeof saved !== 'object' || saved === null) return DEFAULT_LAYOUT
    const { listWidth, phraseHeight } = saved as Record<string, unknown>
    return {
      listWidth: finite(listWidth)
        ? Math.min(Math.max(listWidth, LIST_WIDTH_RANGE.min), LIST_WIDTH_RANGE.max)
        : DEFAULT_LAYOUT.listWidth,
      phraseHeight: finite(phraseHeight) ? Math.max(phraseHeight, PHRASE_HEIGHT_MIN) : DEFAULT_LAYOUT.phraseHeight,
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

/** 覚えられなくても（プライベートモードなど）、今開いている画面ではその大きさのまま */
export function saveLayout(layout: LineEditorLayout, storage: LayoutStorage = localStorage): void {
  try {
    storage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // 次に開いたときに既定の大きさに戻るだけ
  }
}
