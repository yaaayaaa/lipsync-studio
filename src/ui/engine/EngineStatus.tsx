import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '../useApp'
import { EngineStatusContext } from './useEngineStatus'
import type { EngineState } from './useEngineStatus'

const CHECK_INTERVAL_MS = 30_000
const CHECKING: EngineState = { status: 'checking' }

/**
 * 起動時と30秒ごとにエンジンへ /version を問い合わせる。上部の案内・サイドメニュー・設定画面が同じ状態を見るため、
 * 問い合わせはここ1か所で行う。
 */
export function EngineStatusProvider({ children }: { children: ReactNode }) {
  const { client } = useApp()
  // 結果はどのエンジンへの問い合わせかと一緒に持つ。URL を変えた直前の結果を新しいエンジンのものとして出さないため
  const [result, setResult] = useState<{ client: typeof client; state: EngineState } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const check = () =>
      client.version().then(
        (version) => !cancelled && setResult({ client, state: { status: 'ok', version } }),
        () => !cancelled && setResult({ client, state: { status: 'error' } }),
      )
    void check()
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [client, attempt])

  const recheck = useCallback(() => {
    setResult(null)
    setAttempt((n) => n + 1)
  }, [])
  const current = result && result.client === client ? result.state : null
  const value = useMemo(() => ({ state: current ?? CHECKING, recheck }), [current, recheck])
  return <EngineStatusContext.Provider value={value}>{children}</EngineStatusContext.Provider>
}
