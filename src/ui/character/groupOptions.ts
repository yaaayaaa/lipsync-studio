import { findNode, parentId } from '../../core/psd/layerTree'
import type { LayerId, LayerNode } from '../../core/psd/types'

export interface LayerOption {
  node: LayerNode
  /** 表示名（グループならパス付きなど） */
  label: string
}

/**
 * otherId のグループと重なるグループの id（otherId 自身・子孫・祖先）。
 * 口と目のグループが同じ・入れ子だと、目の切り替えが口を消す（またはその逆）ので選ばせない。
 * null・未設定・PSD にないときは空。
 */
export function conflictingGroupIds(tree: LayerNode[], otherId: LayerId | null | undefined): Set<LayerId> {
  const ids = new Set<LayerId>()
  const other = otherId ? findNode(tree, otherId) : undefined
  if (!otherId || !other) return ids
  const addSubtree = (node: LayerNode) => {
    ids.add(node.id)
    node.children.forEach(addSubtree)
  }
  addSubtree(other)
  for (let id = parentId(otherId); id !== null; id = parentId(id)) ids.add(id)
  return ids
}

/**
 * flip を除いた全グループを、親からのパス付きの名前で上から順に並べる。
 * exclude に入っているグループは除く。除いたグループの中もたどる（口の祖先を除いても、口の兄弟は選べる）。
 */
export function groupOptions(nodes: LayerNode[], exclude: ReadonlySet<LayerId> = new Set(), prefix = ''): LayerOption[] {
  return [...nodes]
    .reverse()
    .filter((n) => n.isGroup && !n.flip)
    .flatMap((n) => {
      const label = prefix + n.name
      const inner = groupOptions(n.children, exclude, `${label}/`)
      return exclude.has(n.id) ? inner : [{ node: n, label }, ...inner]
    })
}
