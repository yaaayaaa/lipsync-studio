import { useState } from 'react'
import { AudioLines, ListOrdered, PanelLeftClose, PanelLeftOpen, Settings, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { engineStatusLabel, useEngineStatus } from './engine/useEngineStatus'
import type { EngineState } from './engine/useEngineStatus'

export type Page = 'character' | 'script' | 'line' | 'settings'

const MAIN_PAGES: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'character', label: 'キャラ設定', icon: UserRound },
  { id: 'script', label: 'セリフ', icon: ListOrdered },
  { id: 'line', label: '1行編集', icon: AudioLines },
]

const COLLAPSED_KEY = 'zunda-lipsync.sideNavCollapsed'

// たたんだかどうかは見る人ごとの好みなので、ブラウザに覚えておくだけにする。読めなくても開いた状態で動く
function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // 覚えられないだけで、今の画面ではたたんだ状態のまま使える
  }
}

/** メニューの幅に収まる短い表示。詳しい状態はツールチップと設定画面で見る */
function shortStatus(state: EngineState): string {
  if (state.status === 'ok') return `VOICEVOX ${state.version}`
  if (state.status === 'error') return 'VOICEVOX 未接続'
  return 'VOICEVOX 確認中…'
}

const NAV_ICON = { size: 18, 'aria-hidden': true } as const

function NavItem({
  label,
  icon: Icon,
  current,
  collapsed,
  onSelect,
}: {
  label: string
  icon: LucideIcon
  current: boolean
  collapsed: boolean
  onSelect(): void
}) {
  return (
    <button
      type="button"
      className={`nav-item${current ? ' current' : ''}`}
      aria-current={current ? 'page' : undefined}
      // たたんだときは文字が見えないので、名前をツールチップと読み上げで補う
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={onSelect}
    >
      <Icon {...NAV_ICON} />
      {!collapsed && <span>{label}</span>}
    </button>
  )
}

/** 画面の切り替え。上に作業の画面、下に離して設定を置く。幅が足りないときはアイコンだけにたためる */
export function SideNav({ page, onSelect }: { page: Page; onSelect(page: Page): void }) {
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const { state } = useEngineStatus()
  const toggle = () => {
    setCollapsed(!collapsed)
    saveCollapsed(!collapsed)
  }
  const statusText = `VOICEVOX：${engineStatusLabel(state)}`

  return (
    <nav className={`side-nav${collapsed ? ' collapsed' : ''}`} aria-label="画面">
      <div className="side-nav-head">
        {!collapsed && <span className="app-name">zunda-lipsync</span>}
        <button
          type="button"
          className="nav-toggle"
          aria-label={collapsed ? 'メニューを広げる' : 'メニューをたたむ'}
          title={collapsed ? 'メニューを広げる' : 'メニューをたたむ'}
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          {collapsed ? <PanelLeftOpen {...NAV_ICON} /> : <PanelLeftClose {...NAV_ICON} />}
        </button>
      </div>
      <div className="nav-items">
        {MAIN_PAGES.map((p) => (
          <NavItem
            key={p.id}
            label={p.label}
            icon={p.icon}
            current={page === p.id}
            collapsed={collapsed}
            onSelect={() => onSelect(p.id)}
          />
        ))}
      </div>
      <div className="nav-foot">
        <p className={`nav-engine ${state.status}`} title={statusText}>
          <span className="dot" aria-hidden="true" />
          {collapsed ? <span className="visually-hidden">{statusText}</span> : <span>{shortStatus(state)}</span>}
        </p>
        <NavItem
          label="設定"
          icon={Settings}
          current={page === 'settings'}
          collapsed={collapsed}
          onSelect={() => onSelect('settings')}
        />
      </div>
    </nav>
  )
}
