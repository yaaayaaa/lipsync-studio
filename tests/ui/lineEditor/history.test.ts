import { describe, expect, it } from 'vitest'
import type { LineTuning, ScriptLine } from '../../../src/core/character/types'
import {
  HISTORY_LIMIT,
  applySnapshot,
  emptyHistory,
  finishGesture,
  gestureEntry,
  noGesture,
  noteGestureEdit,
  outsideChange,
  startGesture,
  isTextEntry,
  record,
  redo,
  sameSnapshot,
  shortcutAction,
  snapshotOf,
  undo,
} from '../../../src/ui/lineEditor/history'
import type { Snapshot } from '../../../src/ui/lineEditor/history'

const tuning = (text: string, intonationScale = 1): LineTuning => ({
  text,
  styleId: 3,
  accentPhrases: [],
  pitchScale: 0,
  intonationScale,
  volumeScale: 1,
  pauseLengthScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
})

const snap = (text: string, patch: Partial<Snapshot> = {}): Snapshot => ({
  text,
  speedScale: 1,
  characterId: 'c1',
  expressionId: 'e1',
  tuning: undefined,
  ...patch,
})

describe('record / undo / redo', () => {
  it('round-trips: undo returns the recorded state, redo returns the state it replaced', () => {
    const a = snap('あ')
    const b = snap('い')
    const h = record(emptyHistory, a)

    const undone = undo(h, b)
    expect(undone?.snapshot).toBe(a)
    expect(undone?.history).toEqual({ past: [], future: [b] })

    const redone = redo(undone!.history, a)
    expect(redone?.snapshot).toBe(b)
    expect(redone?.history).toEqual({ past: [a], future: [] })
  })

  it('walks back several steps in order', () => {
    const [a, b, c] = [snap('あ'), snap('い'), snap('う')]
    const h = record(record(emptyHistory, a), b)
    const first = undo(h, c)!
    expect(first.snapshot).toBe(b)
    const second = undo(first.history, b)!
    expect(second.snapshot).toBe(a)
    expect(undo(second.history, a)).toBeNull()
    expect(redo(second.history, a)?.snapshot).toBe(b)
  })

  it('returns null when there is nothing to undo or redo', () => {
    expect(undo(emptyHistory, snap('あ'))).toBeNull()
    expect(redo(emptyHistory, snap('あ'))).toBeNull()
    expect(redo(record(emptyHistory, snap('あ')), snap('い'))).toBeNull()
  })

  it('clears the redo stack when a new edit is recorded after an undo', () => {
    const [a, b] = [snap('あ'), snap('い')]
    const undone = undo(record(emptyHistory, a), b)!
    expect(undone.history.future).toHaveLength(1)
    const next = record(undone.history, a)
    expect(next.future).toEqual([])
    expect(redo(next, snap('え'))).toBeNull()
  })

  it(`keeps at most ${HISTORY_LIMIT} entries and drops the oldest first`, () => {
    expect(HISTORY_LIMIT).toBe(100)
    let h = emptyHistory
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = record(h, snap(String(i)))
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]!.text).toBe('5')
    expect(h.past.at(-1)!.text).toBe(String(HISTORY_LIMIT + 4))
  })

  it('does not mutate the history it was given', () => {
    const h = record(emptyHistory, snap('あ'))
    const frozen = structuredClone(h)
    record(h, snap('い'))
    undo(h, snap('う'))
    expect(h).toEqual(frozen)
  })
})

describe('snapshots', () => {
  const line: ScriptLine = {
    id: 'l1',
    text: 'ずんだ',
    characterId: 'c1',
    expressionId: 'e1',
    speedScale: 1.2,
    tuning: tuning('ずんだ'),
  }

  it('takes only the undoable fields of a line', () => {
    expect(snapshotOf(line)).toEqual({
      text: 'ずんだ',
      speedScale: 1.2,
      characterId: 'c1',
      expressionId: 'e1',
      tuning: tuning('ずんだ'),
    })
  })

  it('applies a snapshot without touching the id', () => {
    const next = applySnapshot(line, snap('もち', { characterId: 'c2', expressionId: null, speedScale: 0.8 }))
    expect(next).toEqual({ id: 'l1', text: 'もち', characterId: 'c2', expressionId: null, speedScale: 0.8 })
  })

  // 作り込みのない状態へ戻すときは、tuning の項目そのものを消す（undefined の項目を残さない）
  it('removes the tuning key when the snapshot has none', () => {
    const next = applySnapshot(line, snap('ずんだ'))
    expect('tuning' in next).toBe(false)
  })

  it('restores the tuning together with its text', () => {
    const t = tuning('ずんだ', 1.7)
    const next = applySnapshot({ ...line, text: 'もち', tuning: undefined }, snap('ずんだ', { tuning: t }))
    expect(next.text).toBe('ずんだ')
    expect(next.tuning).toBe(t)
  })

  it('compares snapshots field by field (tuning by identity)', () => {
    const t = tuning('ずんだ')
    expect(sameSnapshot(snap('あ', { tuning: t }), snap('あ', { tuning: t }))).toBe(true)
    expect(sameSnapshot(snap('あ', { tuning: t }), snap('あ', { tuning: tuning('ずんだ') }))).toBe(false)
    expect(sameSnapshot(snap('あ'), snap('あ', { speedScale: 1.1 }))).toBe(false)
    expect(sameSnapshot(snap('あ'), snap('あ', { expressionId: 'e2' }))).toBe(false)
    expect(sameSnapshot(snap('あ'), snap('い'))).toBe(false)
  })

  describe('tailSeconds', () => {
    it('round-trips with and without a line value; absence removes the key', () => {
      const withTail: ScriptLine = { ...line, tailSeconds: 1.5 }
      expect(snapshotOf(withTail).tailSeconds).toBe(1.5)
      expect('tailSeconds' in snapshotOf(line)).toBe(false)

      expect(applySnapshot(line, snapshotOf(withTail)).tailSeconds).toBe(1.5)
      const cleared = applySnapshot(withTail, snapshotOf(line))
      expect('tailSeconds' in cleared).toBe(false)
    })

    it('keeps an explicit 0 as a value of its own', () => {
      expect(snapshotOf({ ...line, tailSeconds: 0 }).tailSeconds).toBe(0)
      expect(sameSnapshot(snap('あ'), snap('あ', { tailSeconds: 0 }))).toBe(false)
    })

    it('treats a different tailSeconds as a different snapshot', () => {
      expect(sameSnapshot(snap('あ', { tailSeconds: 1 }), snap('あ', { tailSeconds: 1 }))).toBe(true)
      expect(sameSnapshot(snap('あ', { tailSeconds: 1 }), snap('あ', { tailSeconds: 2 }))).toBe(false)
    })

    it('clears the history when only tailSeconds changed elsewhere', () => {
      expect(outsideChange(snap('あ'), snap('あ', { tailSeconds: 2 }))).toBe('clear')
      expect(outsideChange(snap('あ', { tailSeconds: 2 }), snap('あ'))).toBe('clear')
      expect(outsideChange(snap('あ', { tailSeconds: 2 }), snap('あ', { tailSeconds: 2 }))).toBe('none')
    })

    it('restores an absent tailSeconds as an absent key in a gesture entry', () => {
      const before = snap('あ')
      const entry = gestureEntry({ token: 1, lineId: 'l1', before, owned: ['tailSeconds'] }, snap('あ', { tailSeconds: 3 }))
      expect(entry).not.toBeNull()
      expect('tailSeconds' in entry!).toBe(false)
    })
  })
})

describe('shortcutAction', () => {
  const key = (k: string, mods: Partial<Parameters<typeof shortcutAction>[0]> = {}) =>
    shortcutAction({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, ...mods })

  it('maps Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z or Ctrl+Y to redo', () => {
    expect(key('z', { ctrlKey: true })).toBe('undo')
    expect(key('z', { metaKey: true })).toBe('undo')
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toBe('redo')
    expect(key('Z', { metaKey: true, shiftKey: true })).toBe('redo')
    expect(key('y', { ctrlKey: true })).toBe('redo')
  })

  it('ignores other keys, plain keys, Alt combinations and IME composition', () => {
    expect(key('z')).toBeNull()
    expect(key('x', { ctrlKey: true })).toBeNull()
    expect(key('z', { ctrlKey: true, altKey: true })).toBeNull()
    expect(key('z', { ctrlKey: true, isComposing: true })).toBeNull()
    expect(key('y', { metaKey: true })).toBeNull()
  })
})

describe('isTextEntry', () => {
  it('leaves text fields, text areas, selects and editable content to the browser', () => {
    expect(isTextEntry({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTextEntry({ tagName: 'SELECT' })).toBe(true)
    expect(isTextEntry({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isTextEntry({ tagName: 'INPUT', type: 'number' })).toBe(true)
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('handles the shortcut on sliders, buttons and the page itself', () => {
    expect(isTextEntry({ tagName: 'INPUT', type: 'range' })).toBe(false)
    expect(isTextEntry({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false)
    expect(isTextEntry({ tagName: 'BODY' })).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
})

describe('gestures', () => {
  const a = snap('あ')

  it('gives each gesture its own token and ends only the gesture that owns it', () => {
    const first = startGesture(noGesture, 'l1', a)
    expect(first.ended).toBeNull()
    // つまみを押したとき、文の欄の操作はまだ終わっていない場合がある：始めた側の token でしか終わらない
    const second = startGesture(first.state, 'l1', a)
    expect(second.token).not.toBe(first.token)
    expect(second.ended?.token).toBe(first.token)
    // 古い token（文の欄の onBlur・取り残された pointerup）では、今の操作を終えない
    const stale = finishGesture(second.state, first.token)
    expect(stale.ended).toBeNull()
    expect(stale.state).toBe(second.state)
    const done = finishGesture(second.state, second.token)
    expect(done.ended?.token).toBe(second.token)
    expect(done.state.current).toBeNull()
    expect(finishGesture(done.state, second.token).ended).toBeNull()
  })

  it('remembers which fields the gesture\'s own edits changed', () => {
    const { state } = startGesture(noGesture, 'l1', a)
    const t = tuning('あい')
    const g1 = noteGestureEdit(state.current!, snap('あ', { tuning: t }), snap('あい', { tuning: t }))
    const g2 = noteGestureEdit(g1, snap('あい', { tuning: t }), snap('あい'))
    expect([...g2.owned].sort()).toEqual(['text', 'tuning'])
  })

  it('builds the entry from the owned fields only, so writes from elsewhere are not undone or recorded', () => {
    const t = tuning('あ')
    const refreshed = { ...tuning('あ'), styleId: 8 }
    const before = snap('あ', { tuning: t })
    // 文の欄にフォーカスがある間に、声の取り直し（ユーザーの編集でない）だけが入った
    expect(gestureEntry({ token: 1, lineId: 'l1', before, owned: [] }, snap('あ', { tuning: refreshed }))).toBeNull()
    // 文を変えた：戻すのは文だけで、取り直した作り込みはそのまま
    const entry = gestureEntry({ token: 1, lineId: 'l1', before, owned: ['text'] }, snap('あい', { tuning: refreshed }))
    expect(entry).toEqual(snap('あ', { tuning: refreshed }))
  })

  it('restores the text and the dropped tuning together when the commit dropped it', () => {
    const t = tuning('あ')
    const before = snap('あ', { tuning: t })
    const entry = gestureEntry({ token: 1, lineId: 'l1', before, owned: ['text', 'tuning'] }, snap('あい'))
    expect(entry).toEqual(before)
  })

  it('records nothing when the owned fields ended where they started', () => {
    const before = snap('あ', { speedScale: 1 })
    expect(gestureEntry({ token: 1, lineId: 'l1', before, owned: ['speedScale'] }, snap('あ', { speedScale: 1 }))).toBeNull()
  })
})

describe('outsideChange', () => {
  const t = tuning('あ')

  it('sees no change when the fields hold the same values (tuning compared by content)', () => {
    expect(outsideChange(snap('あ', { tuning: t }), snap('あ', { tuning: t }))).toBe('none')
    // 編集の関数は保存のときにもう一度呼ばれるので、作り込みは同じ中身の別オブジェクトになる
    expect(outsideChange(snap('あ', { tuning: t }), snap('あ', { tuning: tuning('あ') }))).toBe('none')
    expect(outsideChange(snap('あ'), snap('あ'))).toBe('none')
  })

  it('clears the history when the text, speed, character or style changed elsewhere', () => {
    expect(outsideChange(snap('あ'), snap('い'))).toBe('clear')
    expect(outsideChange(snap('あ'), snap('あ', { speedScale: 1.5 }))).toBe('clear')
    expect(outsideChange(snap('あ'), snap('あ', { characterId: 'c2' }))).toBe('clear')
    expect(outsideChange(snap('あ'), snap('あ', { expressionId: 'e2' }))).toBe('clear')
  })

  it('clears the history when the tuning was dropped, added or edited elsewhere', () => {
    expect(outsideChange(snap('あ', { tuning: t }), snap('あ'))).toBe('clear')
    expect(outsideChange(snap('あ'), snap('あ', { tuning: t }))).toBe('clear')
    expect(outsideChange(snap('あ', { tuning: t }), snap('あ', { tuning: tuning('あ', 1.5) }))).toBe('clear')
  })

  // 声の取り直しは、ユーザーの編集でなく同じ作り込みを別の声に合わせただけ。消すと取り消しが効かなくなるので履歴は残す
  it('rebases on a voice refresh: only the tuning changed, to another voice for the same text', () => {
    const refreshed = { ...tuning('あ', 1.3), styleId: 8 }
    expect(outsideChange(snap('あ', { tuning: t }), snap('あ', { tuning: refreshed }))).toBe('rebase')
    // ほかの項目も変わっていれば取り直しではない
    expect(outsideChange(snap('あ', { tuning: t }), snap('あ', { speedScale: 2, tuning: refreshed }))).toBe('clear')
    expect(outsideChange(snap('あ', { tuning: t }), snap('あ', { tuning: { ...tuning('い'), styleId: 8 } }))).toBe('clear')
  })
})
