import type { EyeMap, MouthMap } from '../../core/character/types'
import type { LayerId } from '../../core/psd/types'

/**
 * 口グループを選んだときの保存内容。保存済みの値と同じなら null（何もしない＝割り当てを消さない）。
 * 比べるのは PSD で見つかったグループではなく保存値。PSD から消えたグループを指したままでも「未設定」で消せるように。
 * グループを変えたら、前のグループの子を指す割り当ては意味を失うので消す。
 */
export function groupChoicePatch(
  savedGroupId: LayerId | null,
  chosenId: LayerId | null,
): { mouthGroupId: LayerId | null; mouthMap: MouthMap } | null {
  return chosenId === savedGroupId ? null : { mouthGroupId: chosenId, mouthMap: {} }
}

/**
 * 目のグループを選んだときの保存内容。規則は口（groupChoicePatch）と同じ。
 * 古い保存データは eyeGroupId を持たない（undefined）ので、null と同じ「未設定」として扱う。
 */
export function eyeGroupChoicePatch(
  savedGroupId: LayerId | null | undefined,
  chosenId: LayerId | null,
): { eyeGroupId: LayerId | null; eyeMap: EyeMap } | null {
  return chosenId === (savedGroupId ?? null) ? null : { eyeGroupId: chosenId, eyeMap: {} }
}
