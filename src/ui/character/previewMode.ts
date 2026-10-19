import { resolveMouthLayer } from '../../core/character/mouth'
import { VOWELS } from '../../core/character/types'
import type { MouthMap, Vowel } from '../../core/character/types'
import type { LayerId } from '../../core/psd/types'

/** 中央のプレビューで見せる口。口が未割り当てならツリーの状態のまま映る */
export type PreviewMode = Vowel

/** 既定は「閉じ」。喋っていないときの顔なので、ふだん確認したいのはこれ */
export const DEFAULT_PREVIEW_MODE: PreviewMode = 'closed'

/** 切り替えボタンの並び。既定の「閉じ」を先頭にする */
export const PREVIEW_MODES: readonly PreviewMode[] = ['closed', ...VOWELS.filter((v) => v !== 'closed')]

export type PreviewEvent =
  | { type: 'vowelOpened'; vowel: Vowel }
  | { type: 'treeToggled' }
  | { type: 'manual'; mode: PreviewMode }
  | { type: 'groupChanged'; mouthGroupId: LayerId | null; mouthMap: MouthMap }

/** 開いている母音のドロップダウンで強調中の選択肢（保存前の試し見せ） */
export interface LiveMouth {
  vowel: Vowel
  layerId: LayerId | null
}

/** 口を編集しているときに、プレビューが今いじっているものを自動で映すための切り替え規則。どの出来事の後もモードは出来事だけで決まる。 */
export function previewModeAfter(event: PreviewEvent): PreviewMode {
  switch (event.type) {
    case 'vowelOpened':
      return event.vowel
    case 'treeToggled':
      // ツリーをいじったら、既定の顔に戻してその変更を確かめられるようにする
      return DEFAULT_PREVIEW_MODE
    case 'manual':
      return event.mode
    case 'groupChanged': {
      if (event.mouthGroupId === null || event.mouthMap.closed !== undefined) return DEFAULT_PREVIEW_MODE
      return VOWELS.find((v) => event.mouthMap[v] !== undefined) ?? DEFAULT_PREVIEW_MODE
    }
  }
}

/** vowel のプレビューで出す口。live がその母音なら、強調中の選択肢を保存したときと同じ口を出す。 */
export function previewMouthLayer(map: MouthMap, vowel: Vowel, live: LiveMouth | null): LayerId | null {
  if (!live || live.vowel !== vowel) return resolveMouthLayer(map, vowel)
  const tried = { ...map }
  if (live.layerId === null) delete tried[vowel]
  else tried[vowel] = live.layerId
  return resolveMouthLayer(tried, vowel)
}
