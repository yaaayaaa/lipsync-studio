// UI ライブラリ比較ページ（使い捨ての試作）で各実装が満たす共通の形。
import type { ComponentType } from 'react'

export interface MenuItemSpec {
  id: string
  label: string
  danger?: boolean
}

/** 行の「⋮」メニュー。トリガーは lucide の EllipsisVertical を使う。 */
export interface RowMenuDemoProps {
  /** トリガーの aria-label（例: キャラの操作） */
  label: string
  items: MenuItemSpec[]
  onSelect: (id: string) => void
}

export interface LayerOption {
  /** null は「未設定」 */
  id: string | null
  name: string
  /** サムネイル画像（data URL） */
  thumb: string | null
}

/** サムネイル付きプルダウン（口グループ・母音の選択）。 */
export interface LayerSelectDemoProps {
  /** 見出し（例: あ）。aria-label にも使う */
  label: string
  options: LayerOption[]
  value: string | null
  onChange: (id: string | null) => void
  /**
   * 一覧で今指している（キーボード／ホバー）候補。プレビューの即時表示に使う。
   * 閉じたら undefined を渡す。
   */
  onActiveChange: (id: string | null | undefined) => void
}

export interface Impl {
  key: string
  name: string
  /** package@version（自作なら「自作」） */
  packages: string
  RowMenuDemo: ComponentType<RowMenuDemoProps>
  LayerSelectDemo: ComponentType<LayerSelectDemoProps>
  /** 実装して分かったこと（モーダルか、先頭文字ジャンプ、困った点など）を短く */
  notes: string[]
}
