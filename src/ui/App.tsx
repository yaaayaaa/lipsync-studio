import { AppProvider } from './AppContext'
import { CharacterPage } from './character/CharacterPage'
import './app.css'

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>zunda-lipsync</h1>
        <span className="app-tagline">PSD 立ち絵を VOICEVOX の音声にリップシンクして mp4 に書き出します</span>
      </header>
      <AppProvider>
        <CharacterPage />
      </AppProvider>
    </div>
  )
}
