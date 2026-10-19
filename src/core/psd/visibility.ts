import { findNode, parentId } from './layerTree'
import type { LayerId, LayerNode, VisibilityState } from './types'

function forEachNode(nodes: LayerNode[], fn: (node: LayerNode) => void): void {
  for (const node of nodes) {
    fn(node)
    forEachNode(node.children, fn)
  }
}

/** 兄弟（同じ親の子）の配列を、全グループぶん（最上位含む）たどる。 */
function forEachSiblingList(tree: LayerNode[], fn: (siblings: LayerNode[]) => void): void {
  fn(tree)
  forEachNode(tree, (node) => fn(node.children))
}

/** forced は常に表示、flip は常に非表示にする。.pfv 取り込みでも最終パスとして使う。 */
export function enforceFixedRules(tree: LayerNode[], state: VisibilityState): VisibilityState {
  const next = { ...state }
  forEachNode(tree, (node) => {
    if (node.flip) next[node.id] = false
    else if (node.kind === 'forced') next[node.id] = true
  })
  return next
}

/** PSD の hidden を出発点に、radio は表示中の一番上（なければ一番上）の1つだけ残す。 */
export function initialVisibility(tree: LayerNode[]): VisibilityState {
  const state: VisibilityState = {}
  forEachNode(tree, (node) => {
    state[node.id] = node.initiallyVisible
  })
  forEachSiblingList(tree, (siblings) => {
    const radios = siblings.filter((n) => n.kind === 'radio' && !n.flip)
    if (radios.length === 0) return
    const chosen = [...radios].reverse().find((n) => state[n.id]) ?? radios[radios.length - 1]
    for (const r of radios) state[r.id] = r === chosen
  })
  return enforceFixedRules(tree, state)
}

/** next の中で node を表示にする。radio なら兄弟 radio を消す。 */
function show(tree: LayerNode[], next: VisibilityState, node: LayerNode): void {
  next[node.id] = true
  if (node.kind !== 'radio') return
  const pid = parentId(node.id)
  const siblings = pid === null ? tree : (findNode(tree, pid)?.children ?? [])
  for (const s of siblings) {
    if (s.kind === 'radio' && s.id !== node.id) next[s.id] = false
  }
}

/**
 * 新しい state を返す。radio は true にすると兄弟 radio が消え、false にしても変わらない。
 * 表示にするときは祖先も表示にする（PSDTool と同じく、選んだものが必ず見えるように）。
 */
export function setVisible(
  tree: LayerNode[],
  state: VisibilityState,
  id: LayerId,
  visible: boolean,
): VisibilityState {
  const node = findNode(tree, id)
  if (!node) return state
  if (node.kind === 'radio' && !visible) return { ...state }
  const next = { ...state }
  if (!visible) {
    next[id] = false
    return enforceFixedRules(tree, next)
  }
  for (let cur: LayerId | null = id; cur !== null; cur = parentId(cur)) {
    const target = findNode(tree, cur)
    if (target) show(tree, next, target)
  }
  return enforceFixedRules(tree, next)
}

/** 自分と祖先がすべて表示中か。 */
export function isEffectivelyVisible(
  _tree: LayerNode[],
  state: VisibilityState,
  id: LayerId,
): boolean {
  let cur: LayerId | null = id
  while (cur !== null) {
    if (!state[cur]) return false
    cur = parentId(cur)
  }
  return true
}
