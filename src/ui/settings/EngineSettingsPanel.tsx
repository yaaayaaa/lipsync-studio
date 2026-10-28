import { useState } from 'react'
import { engineStatusLabel, useEngineStatus } from '../engine/useEngineStatus'
import { normalizeEngineUrl } from '../engineUrl'
import { errorMessage } from '../script/lineJobs'
import { useApp } from '../useApp'
import { SettingsGroup, SettingsRow } from './SettingsGroup'

/** VOICEVOX エンジンの URL と接続状態。URL が同じなら「再接続」で問い合わせ直す */
export function EngineSettingsPanel() {
  const { settings, saveSettings } = useApp()
  const { state, recheck } = useEngineStatus()
  const [draft, setDraft] = useState(settings.engineUrl)
  const [urlError, setUrlError] = useState<string | null>(null)

  const apply = () => {
    const url = normalizeEngineUrl(draft)
    if (!url) {
      setUrlError('http:// または https:// で始まる URL を入力してください')
      return
    }
    setUrlError(null)
    setDraft(url)
    if (url === settings.engineUrl) {
      recheck()
      return
    }
    saveSettings({ ...settings, engineUrl: url }).catch((e: unknown) =>
      setUrlError(`URL を保存できませんでした: ${errorMessage(e)}`),
    )
  }

  return (
    <>
      <SettingsGroup
        footer={
          <>
            {urlError && (
              <p className="notice error" role="alert">
                {urlError}
              </p>
            )}
            <p>
              既定は http://localhost:50021 です。別のパソコンのエンジンを使うときは、そのパソコンで VOICEVOX
              のエンジン（エディターではなく、エンジンの run または vv-engine/run）を --host 0.0.0.0
              を付けて起動してください。
            </p>
          </>
        }
      >
        <form
          className="settings-row engine-url"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <span className="settings-row-name">URL</span>
          <span className="settings-row-control">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="VOICEVOX エンジンの URL"
            />
            <button type="submit">{normalizeEngineUrl(draft) === settings.engineUrl ? '再接続' : '変更'}</button>
          </span>
        </form>
        <SettingsRow name="状態">
          <span className={`engine-state ${state.status}`} role="status">
            {engineStatusLabel(state)}
          </span>
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
