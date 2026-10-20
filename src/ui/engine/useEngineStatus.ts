import { createContext, useContext } from 'react'

export type EngineState = { status: 'checking' } | { status: 'ok'; version: string } | { status: 'error' }

export interface EngineStatusValue {
  state: EngineState
  /** URL はそのままで、すぐに問い合わせ直す */
  recheck(): void
}

/** 値は EngineStatusProvider（EngineStatus.tsx）が入れる。 */
export const EngineStatusContext = createContext<EngineStatusValue | null>(null)

export function useEngineStatus(): EngineStatusValue {
  const value = useContext(EngineStatusContext)
  if (!value) throw new Error('useEngineStatus must be used inside <EngineStatusProvider>')
  return value
}

/** サイドメニューや設定画面に出す、接続状態の短い説明 */
export function engineStatusLabel(state: EngineState): string {
  if (state.status === 'ok') return `接続済み（${state.version}）`
  if (state.status === 'error') return '接続できません'
  return '確認中…'
}
