import { useCallback, useState } from 'react'
import { AppProvider } from './AppContext'
import { CharacterPage } from './character/CharacterPage'
import { EngineStatusProvider } from './engine/EngineStatus'
import { EngineBanner } from './EngineBanner'
import { LineEditorPage } from './lineEditor/LineEditorPage'
import { ScriptProvider } from './script/ScriptContext'
import { SettingsPage } from './settings/SettingsPage'
import { SideNav } from './SideNav'
import type { Page } from './SideNav'
import { SupportBanner } from './SupportBanner'
import { useApp } from './useApp'
import './app.css'

export function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}

/** 画面の切り替え。キャラと設定を読み終えてから置く（最初に開く画面をキャラの有無で決めるため） */
function AppShell() {
  const { characters } = useApp()
  // ふだんは台本から始める。キャラがまだいなければ、台本では何もできないのでキャラ設定から
  const [page, setPage] = useState<Page>(() => (characters.length > 0 ? 'line' : 'character'))
  const openLineEditorPage = useCallback(() => setPage('line'), [])
  const openSettings = useCallback(() => setPage('settings'), [])
  return (
    <EngineStatusProvider>
      <ScriptProvider onOpenLineEditor={openLineEditorPage}>
        <div className="app">
          <SideNav page={page} onSelect={setPage} />
          <main className="app-main">
            <SupportBanner />
            {/* 設定画面では接続状態を画面の中に出すので、同じ案内を重ねない */}
            {page !== 'settings' && <EngineBanner onOpenSettings={openSettings} />}
            {/* どれも置いたままにする：画面を切り替えても書き出しの進行や画面の状態を失わないため */}
            <div className="page" hidden={page !== 'character'}>
              <CharacterPage />
            </div>
            <div className="page" hidden={page !== 'line'}>
              <LineEditorPage active={page === 'line'} />
            </div>
            <div className="page" hidden={page !== 'settings'}>
              <SettingsPage />
            </div>
          </main>
        </div>
      </ScriptProvider>
    </EngineStatusProvider>
  )
}
