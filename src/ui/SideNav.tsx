import { useEffect, useRef, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, ScrollText, Settings, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PointerEvent } from 'react'
import { engineStatusLabel, useEngineStatus } from './engine/useEngineStatus'
import type { EngineState } from './engine/useEngineStatus'

export type Page = 'character' | 'line' | 'settings'

const MAIN_PAGES: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'character', label: 'キャラ設定', icon: UserRound },
  { id: 'line', label: '台本', icon: ScrollText },
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

// たたんだメニューにマウスを置いてから広げるまでの間。横切っただけで開かないように
const PEEK_DELAY_MS = 150

function NavItem({
  label,
  icon: Icon,
  current,
  showLabel,
  onSelect,
}: {
  label: string
  icon: LucideIcon
  current: boolean
  /** たたんでいても、マウスを置いて重ねて広げている間は名前を出す */
  showLabel: boolean
  onSelect(): void
}) {
  return (
    <button
      type="button"
      className={`nav-item${current ? ' current' : ''}`}
      aria-current={current ? 'page' : undefined}
      // 名前が見えないときは、ツールチップと読み上げで補う
      title={showLabel ? undefined : label}
      aria-label={showLabel ? undefined : label}
      onClick={onSelect}
    >
      <Icon {...NAV_ICON} />
      {showLabel && <span>{label}</span>}
    </button>
  )
}

/**
 * 画面の切り替え。上に作業の画面、下に離して設定を置く。幅が足りないときはアイコンだけにたためる。
 * たたんでいるときにマウスを置くと、画面を押し下げずに上へ重ねて広げる（離すと戻る）。
 * 広げるボタンとは違い、重ねるだけなので画面の並びは変わらない
 */
export function SideNav({ page, onSelect }: { page: Page; onSelect(page: Page): void }) {
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [peek, setPeek] = useState(false)
  const peekTimer = useRef<number | undefined>(undefined)
  const { state } = useEngineStatus()
  // 最後にメニューを押したのがマウスか。たたむボタンをキーボードで押したときと区別する
  const pressedByMouse = useRef(false)
  const toggle = () => {
    setCollapsed(!collapsed)
    saveCollapsed(!collapsed)
    window.clearTimeout(peekTimer.current)
    // マウスでたたんだときは、まだマウスが乗っているので、重ねて広げたまま残す（離したら閉じる）。
    // その場で閉じると、目の前のメニューが急に縮む
    setPeek(!collapsed && pressedByMouse.current)
  }
  useEffect(() => () => window.clearTimeout(peekTimer.current), [])
  // 重ねて広げるのはマウスだけ（タッチで触れたときに開いたまま残らないように）
  const startPeek = (e: PointerEvent) => {
    if (!collapsed || e.pointerType !== 'mouse') return
    window.clearTimeout(peekTimer.current)
    peekTimer.current = window.setTimeout(() => setPeek(true), PEEK_DELAY_MS)
  }
  const endPeek = () => {
    window.clearTimeout(peekTimer.current)
    setPeek(false)
  }
  const peeking = collapsed && peek
  const showLabels = !collapsed || peeking
  const statusText = `VOICEVOX：${engineStatusLabel(state)}`

  return (
    // たたんだときの幅を外枠で取っておき、広げたメニューはその上に重ねる
    <div className={`side-nav-slot${collapsed ? ' collapsed' : ''}`}>
      <nav
        className={`side-nav${collapsed ? ' collapsed' : ''}${peeking ? ' peek' : ''}`}
        aria-label="画面"
        onPointerEnter={startPeek}
        onPointerLeave={endPeek}
        onPointerDown={(e) => {
          pressedByMouse.current = e.pointerType === 'mouse'
        }}
        onKeyDown={() => {
          pressedByMouse.current = false
        }}
      >
        <div className="side-nav-head">
          {showLabels && <span className="app-name">zunda-lipsync</span>}
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
              showLabel={showLabels}
              onSelect={() => onSelect(p.id)}
            />
          ))}
        </div>
        <div className="nav-foot">
          <p className={`nav-engine ${state.status}`} title={statusText}>
            <span className="dot" aria-hidden="true" />
            {showLabels ? <span>{shortStatus(state)}</span> : <span className="visually-hidden">{statusText}</span>}
          </p>
          <NavItem
            label="設定"
            icon={Settings}
            current={page === 'settings'}
            showLabel={showLabels}
            onSelect={() => onSelect('settings')}
          />
        </div>
      </nav>
    </div>
  )
}
