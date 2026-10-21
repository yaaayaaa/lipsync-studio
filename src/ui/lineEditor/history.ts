import type { ScriptLine } from '../../core/character/types'

// 1行編集の取り消しとやり直し。行ごとに、変更する前の状態（Snapshot）を積む。
// 作り込み（tuning）は丸ごと持つ。中身は書き換えずに新しいオブジェクトを作る約束なので、参照を持つだけで足りる。

/** 取り消しで戻す項目。文を戻すときは、捨てた作り込みも一緒に戻す */
export type Snapshot = Pick<
  ScriptLine,
  'text' | 'speedScale' | 'tuning' | 'tailSeconds' | 'voice' | 'characterId' | 'expressionId'
>

export interface History {
  /** 古い順。最後が直前の状態 */
  past: Snapshot[]
  /** 取り消した状態。最後が次にやり直す状態 */
  future: Snapshot[]
}

/** 1行あたりに覚える件数。超えたら古いものから捨てる */
export const HISTORY_LIMIT = 100

export const emptyHistory: History = { past: [], future: [] }

/** 変更の前の状態を積む。やり直しの履歴は消える */
export function record(h: History, before: Snapshot): History {
  const past = [...h.past, before]
  return { past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past, future: [] }
}

/** 直前の状態へ戻す。current は今の状態で、やり直し用に積む。戻せなければ null */
export function undo(h: History, current: Snapshot): { history: History; snapshot: Snapshot } | null {
  const snapshot = h.past.at(-1)
  if (!snapshot) return null
  return { history: { past: h.past.slice(0, -1), future: [...h.future, current] }, snapshot }
}

/** 取り消した状態をやり直す。current は今の状態で、取り消し用に積む。やり直せなければ null */
export function redo(h: History, current: Snapshot): { history: History; snapshot: Snapshot } | null {
  const snapshot = h.future.at(-1)
  if (!snapshot) return null
  return { history: { past: [...h.past, current], future: h.future.slice(0, -1) }, snapshot }
}

export function snapshotOf(line: ScriptLine): Snapshot {
  const { text, speedScale, characterId, expressionId, tuning, tailSeconds, voice } = line
  const snapshot: Snapshot = { text, speedScale, characterId, expressionId }
  if (tuning) snapshot.tuning = tuning
  if (tailSeconds !== undefined) snapshot.tailSeconds = tailSeconds
  if (voice) snapshot.voice = voice
  return snapshot
}

/** 行を Snapshot の状態にする。作り込み・終端の長さ・行の声のない状態なら、その項目ごと消す（ないことも状態） */
export function applySnapshot(line: ScriptLine, s: Snapshot): ScriptLine {
  const { tuning: _droppedTuning, tailSeconds: _droppedTail, voice: _droppedVoice, ...rest } = line
  const next: ScriptLine = { ...rest, text: s.text, speedScale: s.speedScale, characterId: s.characterId, expressionId: s.expressionId }
  if (s.tuning) next.tuning = s.tuning
  if (s.tailSeconds !== undefined) next.tailSeconds = s.tailSeconds
  if (s.voice) next.voice = s.voice
  return next
}

/** 同じ状態か（作り込みは参照で比べる）。変わっていない操作は履歴に積まない */
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.text === b.text &&
    a.speedScale === b.speedScale &&
    a.characterId === b.characterId &&
    a.expressionId === b.expressionId &&
    a.tuning === b.tuning &&
    a.tailSeconds === b.tailSeconds &&
    a.voice === b.voice
  )
}

/** 作り込みが同じか。参照が違っても中身が同じなら同じ（編集の関数は保存のときにもう一度呼ばれ、別オブジェクトになる） */
function sameTuning(a: Snapshot['tuning'], b: Snapshot['tuning']): boolean {
  return a === b || (a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b))
}

/**
 * 履歴が最後に見た状態（seen）から、1行編集の編集の経路（editLine・取り消し）を通らずに行が変わったときの扱い。
 * - none：変わっていない
 * - rebase：声の取り直しだけ（同じ文の作り込みを別の声に合わせた）。ユーザーの編集でないので履歴は残し、見た状態だけ進める
 * - clear：それ以外（「セリフ」の画面での変更など）。古い履歴で戻すと、ほかの画面の変更を黙って巻き戻すので捨てる
 */
export function outsideChange(seen: Snapshot, current: Snapshot): 'none' | 'rebase' | 'clear' {
  const restSame =
    seen.text === current.text &&
    seen.speedScale === current.speedScale &&
    seen.characterId === current.characterId &&
    seen.expressionId === current.expressionId &&
    seen.tailSeconds === current.tailSeconds &&
    seen.voice?.styleId === current.voice?.styleId
  if (restSame && sameTuning(seen.tuning, current.tuning)) return 'none'
  const refreshed =
    restSame &&
    seen.tuning !== undefined &&
    current.tuning !== undefined &&
    seen.tuning.text === current.tuning.text &&
    seen.tuning.styleId !== current.tuning.styleId
  return refreshed ? 'rebase' : 'clear'
}

// 続けて何度も変わる操作（つまみのドラッグ・文の入力から確定まで）は1件にまとめる。
// 操作は始めた側が token で持ち、その token でしか終わらない（別の操作の終わりの知らせで切れないように）。

type SnapshotField = keyof Snapshot
const SNAPSHOT_FIELDS: readonly SnapshotField[] = [
  'text',
  'speedScale',
  'tuning',
  'tailSeconds',
  'voice',
  'characterId',
  'expressionId',
]

export interface Gesture {
  token: number
  lineId: string
  /** 始めたときの状態 */
  before: Snapshot
  /** この操作の編集が変えた項目。履歴にはこの項目だけを戻す形で積む */
  owned: SnapshotField[]
}

export interface GestureState {
  current: Gesture | null
  nextToken: number
}

export const noGesture: GestureState = { current: null, nextToken: 1 }

/** 操作を始める。途中の操作があれば終えて ended で返す（積むのは呼び出し側） */
export function startGesture(s: GestureState, lineId: string, before: Snapshot) {
  const token = s.nextToken
  return {
    state: { current: { token, lineId, before, owned: [] }, nextToken: token + 1 },
    token,
    ended: s.current,
  }
}

/** token の操作を終える。もう終わっている・別の操作に替わっていたら何もしない（ended は null） */
export function finishGesture(s: GestureState, token: number): { state: GestureState; ended: Gesture | null } {
  if (s.current?.token !== token) return { state: s, ended: null }
  return { state: { ...s, current: null }, ended: s.current }
}

/** 操作の中の1回の編集（current → next）で変わった項目を、その操作のものとして覚える */
export function noteGestureEdit(g: Gesture, current: Snapshot, next: Snapshot): Gesture {
  const added = SNAPSHOT_FIELDS.filter((f) => current[f] !== next[f] && !g.owned.includes(f))
  return added.length === 0 ? g : { ...g, owned: [...g.owned, ...added] }
}

/**
 * 終えた操作の履歴の1件。操作が変えた項目だけを始めの値に戻した状態で、ほかの項目は今のまま
 * （その間に入った声の取り直しなど、ユーザーの編集でない書き込みを取り消しで巻き戻さない）。
 * 操作が変えた項目が始めと同じに戻っていたら null（積まない）
 */
export function gestureEntry(g: Gesture, after: Snapshot): Snapshot | null {
  if (!g.owned.some((f) => g.before[f] !== after[f])) return null
  const entry: Snapshot = { ...after }
  for (const f of g.owned) Object.assign(entry, { [f]: g.before[f] })
  if (entry.tuning === undefined) delete entry.tuning
  if (entry.tailSeconds === undefined) delete entry.tailSeconds
  if (entry.voice === undefined) delete entry.voice
  return entry
}

export type HistoryAction = 'undo' | 'redo'

/** キーの組み合わせ。KeyboardEvent の一部 */
export interface ShortcutKey {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  isComposing: boolean
}

/** Ctrl/Cmd+Z で取り消し、Ctrl/Cmd+Shift+Z と Ctrl+Y でやり直し。それ以外は null */
export function shortcutAction(e: ShortcutKey): HistoryAction | null {
  if (e.altKey || e.isComposing || !(e.ctrlKey || e.metaKey)) return null
  const key = e.key.toLowerCase()
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && e.ctrlKey && !e.shiftKey) return 'redo'
  return null
}

/** 文字を打つ欄の input の type 以外（つまみ・ボタンなど）。ここでは取り消しを横取りしてよい */
const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image'])

/** フォーカスが文字を打つ欄にあるか。あればブラウザ標準の取り消しに任せる */
export function isTextEntry(el: { tagName: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  return tag === 'INPUT' && !NON_TEXT_INPUTS.has((el.type ?? 'text').toLowerCase())
}
