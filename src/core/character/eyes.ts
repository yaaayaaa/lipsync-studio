import type { LayerId, LayerNode, VisibilityState } from '../psd/types'
import { showOnlyChild } from './mouth'
import type { Character, EyeState } from './types'

export interface BlinkSpec {
  groupId: LayerId
  closed: LayerId
  /** 半目が未割り当てなら null（閉じ目で代用する） */
  half: LayerId | null
}

/** 目のグループと閉じ目が揃っているときだけ瞬きできる。古い保存データ（項目なし）は null。 */
export function blinkSpec(character: Pick<Character, 'eyeGroupId' | 'eyeMap'>): BlinkSpec | null {
  const { eyeGroupId, eyeMap } = character
  if (!eyeGroupId || !eyeMap?.closed) return null
  return { groupId: eyeGroupId, closed: eyeMap.closed, half: eyeMap.half ?? null }
}

/** 当てるレイヤー。open はスタイルの表示のままなので null。 */
export function eyeLayer(spec: BlinkSpec, eye: EyeState): LayerId | null {
  if (eye === 'open') return null
  if (eye === 'half') return spec.half ?? spec.closed
  return spec.closed
}

export function applyEyes(
  tree: LayerNode[],
  state: VisibilityState,
  spec: BlinkSpec | null,
  eye: EyeState,
): VisibilityState {
  if (spec === null) return state
  const layerId = eyeLayer(spec, eye)
  if (layerId === null) return state
  return showOnlyChild(tree, state, spec.groupId, layerId)
}
