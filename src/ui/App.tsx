import { useCallback, useState } from 'react'
import { AppProvider } from './AppContext'
import { CharacterPage } from './character/CharacterPage'
import { EngineBanner } from './EngineBanner'
import { LineEditorPage } from './lineEditor/LineEditorPage'
import { ScriptProvider } from './script/ScriptContext'
import { ScriptPage } from './script/ScriptPage'
import { SupportBanner } from './SupportBanner'
import './app.css'

type Tab = 'character' | 'script' | 'line'

const TABS: { id: Tab; label: string }[] = [
  { id: 'character', label: 'キャラ設定' },
  { id: 'script', label: 'セリフ' },
  { id: 'line', label: '1行編集' },
]

export function App() {
  const [tab, setTab] = useState<Tab>('character')
  const openLineEditorTab = useCallback(() => setTab('line'), [])
  return (
    <div className="app">
      <header className="app-header">
        <h1>zunda-lipsync</h1>
        <nav className="tabs" role="tablist" aria-label="画面">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'active' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <span className="app-tagline">PSD 立ち絵を VOICEVOX の音声にリップシンクして mp4 に書き出します</span>
      </header>
      <AppProvider>
        <SupportBanner />
        <EngineBanner />
        <ScriptProvider onOpenLineEditor={openLineEditorTab}>
          {/* どれも置いたままにする：タブを切り替えても書き出しの進行や画面の状態を失わないため */}
          <div className="page" hidden={tab !== 'character'}>
            <CharacterPage />
          </div>
          <div className="page" hidden={tab !== 'script'}>
            <ScriptPage active={tab === 'script'} />
          </div>
          <div className="page" hidden={tab !== 'line'}>
            <LineEditorPage active={tab === 'line'} />
          </div>
        </ScriptProvider>
      </AppProvider>
    </div>
  )
}
