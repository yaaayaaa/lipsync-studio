import { useState } from 'react'
import { AudioLines, Clapperboard, Palette } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEngineStatus } from '../engine/useEngineStatus'
import type { EngineState } from '../engine/useEngineStatus'
import { useScriptLines } from '../script/useScriptLines'
import { AppearanceSettingsPanel } from './AppearanceSettingsPanel'
import { EngineSettingsPanel } from './EngineSettingsPanel'
import { ExportSettingsPanel } from './ExportSettingsPanel'

type SectionId = 'engine' | 'export' | 'appearance'

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: 'engine', label: 'VOICEVOX エンジン', icon: AudioLines },
  { id: 'export', label: '書き出し', icon: Clapperboard },
  { id: 'appearance', label: '表示', icon: Palette },
]

/** 一覧の行の右に出す、短い接続状態（詳しい状態は項目の中に出す） */
const SHORT_STATUS: Record<EngineState['status'], string> = { ok: '接続済み', error: '未接続', checking: '確認中' }

const NAV_ICON = { size: 18, 'aria-hidden': true } as const

/**
 * アプリ全体の設定。iPad の設定アプリのように、左の一覧で項目を選び、右にその中身を出す。設定が増えたら項目を足す。
 * 書き出し中は書き出し設定を変えられない（途中で解像度などが変わると1本ごとに食い違うため）。
 */
export function SettingsPage() {
  const { exportLocked } = useScriptLines()
  const { state } = useEngineStatus()
  const [section, setSection] = useState<SectionId>('engine')
  const current = SECTIONS.find((s) => s.id === section)!

  return (
    <div className="settings-page">
      <nav className="settings-nav" aria-label="設定の項目">
        <h2 className="settings-title">設定</h2>
        <div className="settings-nav-items">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`settings-nav-item${id === section ? ' current' : ''}`}
              aria-current={id === section ? 'page' : undefined}
              onClick={() => setSection(id)}
            >
              <Icon {...NAV_ICON} />
              <span className="settings-nav-label">{label}</span>
              {/* エンジンにつながっているかは、項目を開かなくても分かるようにする */}
              {id === 'engine' && (
                <span className={`settings-nav-detail ${state.status}`}>{SHORT_STATUS[state.status]}</span>
              )}
            </button>
          ))}
        </div>
      </nav>
      <section className="settings-content" aria-labelledby="settings-section-title">
        <h2 id="settings-section-title" className="settings-section-title">
          {current.label}
        </h2>
        {section === 'engine' && <EngineSettingsPanel />}
        {section === 'export' && <ExportSettingsPanel disabled={exportLocked} />}
        {section === 'appearance' && <AppearanceSettingsPanel />}
      </section>
    </div>
  )
}
