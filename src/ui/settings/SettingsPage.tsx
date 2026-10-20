import { useScriptLines } from '../script/useScriptLines'
import { EngineSettingsPanel } from './EngineSettingsPanel'
import { ExportSettingsPanel } from './ExportSettingsPanel'

/**
 * アプリ全体の設定。まとまりごとに見出し付きの欄を縦に並べる。設定が増えたら欄を足す。
 * 書き出し中は書き出し設定を変えられない（途中で解像度などが変わると1本ごとに食い違うため）。
 */
export function SettingsPage() {
  const { exportLocked } = useScriptLines()
  return (
    <div className="settings-page">
      <div className="settings-body">
        <h2 className="settings-title">設定</h2>
        <EngineSettingsPanel />
        <ExportSettingsPanel disabled={exportLocked} />
        {exportLocked && <p className="hint">書き出し中は書き出しの設定を変えられません</p>}
      </div>
    </div>
  )
}
