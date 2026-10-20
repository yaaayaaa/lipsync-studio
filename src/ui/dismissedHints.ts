// ×で閉じた説明。見る人ごとの好みなので、IndexedDB の設定ではなくブラウザ（localStorage）に覚える。
// 読めない・壊れているときは、どれも閉じていない（説明が出る）として扱う。

const DISMISSED_KEY = 'zunda-lipsync.dismissedHints'

type HintStorage = Pick<Storage, 'getItem' | 'setItem'>

export function loadDismissedHints(storage: HintStorage = localStorage): Set<string> {
  try {
    const saved: unknown = JSON.parse(storage.getItem(DISMISSED_KEY) ?? '[]')
    return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** 覚えられなくても（プライベートモードなど）、今開いている画面では閉じたまま */
export function dismissHint(id: string, storage: HintStorage = localStorage): void {
  const next = loadDismissedHints(storage)
  next.add(id)
  try {
    storage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
  } catch {
    // 次に開いたときにまた出るだけ
  }
}
