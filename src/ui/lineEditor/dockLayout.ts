// 1行編集のパネルの並び（タブのドラッグで分けたり束ねたりした結果）。見る人・画面ごとの好みなので、
// IndexedDB の設定ではなくブラウザ（localStorage）に覚える。読めない・壊れている・パネルが足りないときは
// 初めの並びで開く（パネルが欠けた並びを開くと、その部品を出す場所がなくなるため）。
import type { SerializedDockview } from 'dockview-react'

/** パネルの ID。dockview の部品名も同じにする */
export const PANEL_IDS = ['lines', 'text', 'preview', 'accent', 'pitch', 'length', 'params'] as const
export type PanelId = (typeof PANEL_IDS)[number]

export const PANEL_TITLES: Record<PanelId, string> = {
  lines: 'セリフ一覧',
  text: 'セリフ',
  preview: 'プレビュー',
  accent: 'アクセント',
  pitch: '高さ',
  length: '長さ',
  params: 'その他',
}

/** 初めの並びの大きさ。画面全体に対する割合で決める（画面の大きさが違っても同じ見え方になるように） */
export const DEFAULT_PROPORTIONS = {
  /** 左の一覧の幅（全体の幅に対して） */
  linesWidth: 0.12,
  /** 右のその他の列の幅（全体の幅に対して）。残りは真ん中の列 */
  paramsWidth: 0.2,
  /** 真ん中の列の下のアクセント・高さ・長さ・セリフの束の高さ（全体の高さに対して）。残りはプレビュー */
  phraseHeight: 0.3,
}

const DOCK_LAYOUT_KEY = 'zunda-lipsync.lineEditorDock'

type DockStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** パネルがちょうど1つずつ、それぞれの部品で入っているか */
function hasEveryPanel(saved: unknown): saved is SerializedDockview {
  if (!isObject(saved) || !isObject(saved.grid) || !isObject(saved.panels)) return false
  const { panels } = saved
  return (
    Object.keys(panels).length === PANEL_IDS.length &&
    PANEL_IDS.every((id) => {
      const panel = panels[id]
      return isObject(panel) && panel.contentComponent === id
    })
  )
}

export function loadDockLayout(storage: DockStorage = localStorage): SerializedDockview | null {
  try {
    const saved: unknown = JSON.parse(storage.getItem(DOCK_LAYOUT_KEY) ?? 'null')
    return hasEveryPanel(saved) ? saved : null
  } catch {
    return null
  }
}

/** 覚えられなくても（プライベートモードなど）、今開いている画面ではその並びのまま */
export function saveDockLayout(layout: SerializedDockview, storage: DockStorage = localStorage): void {
  try {
    storage.setItem(DOCK_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    // 次に開いたときに初めの並びに戻るだけ
  }
}

const resetListeners = new Set<() => void>()

/** 覚えた並びを捨て、1行編集を初めの並びに戻す（設定画面から呼ぶ。1行編集は裏で開いたままなので知らせる） */
export function resetDockLayout(storage: DockStorage = localStorage): void {
  try {
    storage.removeItem(DOCK_LAYOUT_KEY)
  } catch {
    // 消せなくても、1行編集は初めの並びに戻り、その並びで上書きされる
  }
  for (const listener of resetListeners) listener()
}

/** resetDockLayout が呼ばれたら知らせる。戻り値で知らせを止める */
export function onDockLayoutReset(listener: () => void): () => void {
  resetListeners.add(listener)
  return () => resetListeners.delete(listener)
}

const revealListeners = new Set<(id: PanelId) => void>()

/** パネルを前に出す（束の中で隠れたタブなら、そのタブを開く）。パネルの中身から呼ぶ */
export function revealDockPanel(id: PanelId): void {
  for (const listener of revealListeners) listener(id)
}

/** revealDockPanel が呼ばれたら知らせる。戻り値で知らせを止める */
export function onRevealDockPanel(listener: (id: PanelId) => void): () => void {
  revealListeners.add(listener)
  return () => revealListeners.delete(listener)
}
