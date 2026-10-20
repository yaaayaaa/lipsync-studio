import { findNode } from '../psd/layerTree'
import type { LayerId, LayerNode, VisibilityState } from '../psd/types'
import type { MouthMap, Vowel } from './types'

/** 未設定の母音は closed にフォールバックし、closed も未設定なら null。 */
export function resolveMouthLayer(map: MouthMap, vowel: Vowel): LayerId | null {
  return map[vowel] ?? map.closed ?? null
}

/** グループ直下の子を全部消して layerId だけ表示する（スタイル側の radio 状態より優先）。グループが木になければそのまま返す。 */
export function showOnlyChild(
  tree: LayerNode[],
  state: VisibilityState,
  groupId: LayerId,
  layerId: LayerId,
): VisibilityState {
  const group = findNode(tree, groupId)
  if (!group) return state
  const next = { ...state }
  for (const child of group.children) next[child.id] = false
  next[layerId] = true
  return next
}

/** 口グループ直下の子を全部消して mouthLayerId だけ表示する。 */
export function applyMouth(
  tree: LayerNode[],
  state: VisibilityState,
  mouthGroupId: LayerId | null,
  mouthLayerId: LayerId | null,
): VisibilityState {
  if (mouthGroupId === null || mouthLayerId === null) return state
  return showOnlyChild(tree, state, mouthGroupId, mouthLayerId)
}
