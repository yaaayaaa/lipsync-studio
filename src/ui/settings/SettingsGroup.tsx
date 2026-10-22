import type { ReactNode } from 'react'

/**
 * 設定の行をまとめる角丸の枠（iPad の設定アプリの「グループ」）。行の間には細い線を引く。
 * footer は枠の下に小さく出す説明
 */
export function SettingsGroup({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="settings-group">
      <div className="settings-group-rows">{children}</div>
      {footer && <div className="settings-group-footer">{footer}</div>}
    </div>
  )
}

/** 設定の1行。名前を左に、操作を右に置く。label を付けると、名前を押しても操作にフォーカスが移る */
export function SettingsRow({ name, children, label = false }: { name: string; children: ReactNode; label?: boolean }) {
  const Row = label ? 'label' : 'div'
  return (
    <Row className="settings-row">
      <span className="settings-row-name">{name}</span>
      <span className="settings-row-control">{children}</span>
    </Row>
  )
}
