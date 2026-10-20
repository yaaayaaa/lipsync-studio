import { useCallback, useState } from 'react'
import { AppProvider } from './AppContext'
import { CharacterPage } from './character/CharacterPage'
import { EngineStatusProvider } from './engine/EngineStatus'
import { EngineBanner } from './EngineBanner'
import { LineEditorPage } from './lineEditor/LineEditorPage'
import { ScriptProvider } from './script/ScriptContext'
import { ScriptPage } from './script/ScriptPage'
import { SettingsPage } from './settings/SettingsPage'
import { SideNav } from './SideNav'
import type { Page } from './SideNav'
import { SupportBanner } from './SupportBanner'
import './app.css'

export function App() {
  const [page, setPage] = useState<Page>('character')
  const openLineEditorPage = useCallback(() => setPage('line'), [])
  const openSettings = useCallback(() => setPage('settings'), [])
  return (
    <AppProvider>
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
              <div className="page" hidden={page !== 'script'}>
                <ScriptPage active={page === 'script'} />
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
    </AppProvider>
  )
}
