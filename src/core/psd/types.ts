import type { Layer } from 'ag-psd'

/** 子の配列インデックスを '/' でつないだもの（例 "2/0/5"）。ag-psd の配列順（下から上）。 */
export type LayerId = string

export type LayerKind = 'normal' | 'radio' | 'forced'

export interface LayerNode {
  id: LayerId
  /** 表示名（先頭の * と ! を除いたもの） */
  name: string
  /** PSD 上の名前そのまま（.pfv の照合に使う） */
  rawName: string
  kind: LayerKind
  isGroup: boolean
  /** :flipx / :flipy / :flipxy。常に非表示・ツリー非表示 */
  flip: boolean
  /** PSD の hidden の逆 */
  initiallyVisible: boolean
  /** 下から上の順 */
  children: LayerNode[]
  /** 合成で使う元データ */
  source: Layer
}

export type VisibilityState = Record<LayerId, boolean>
