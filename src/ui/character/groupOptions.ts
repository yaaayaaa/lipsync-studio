import type { LayerId, LayerNode } from '../../core/psd/types'
import type { LayerOption } from './LayerSelect'

/**
 * flip を除いた全グループを、親からのパス付きの名前で上から順に並べる。
 * excludeId のグループは（子孫ごと）除く。口と目で同じグループを選ばせないため。
 */
export function groupOptions(nodes: LayerNode[], excludeId: LayerId | null = null, prefix = ''): LayerOption[] {
  return [...nodes]
    .reverse()
    .filter((n) => n.isGroup && !n.flip && n.id !== excludeId)
    .flatMap((n) => {
      const label = prefix + n.name
      return [{ node: n, label }, ...groupOptions(n.children, excludeId, `${label}/`)]
    })
}
