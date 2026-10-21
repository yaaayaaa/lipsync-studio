import { createContext, use, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { DockviewDefaultTab, DockviewReact, themeLight } from 'dockview-react'
import type {
  DockviewApi,
  DockviewReadyEvent,
  DockviewTheme,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import {
  DEFAULT_PROPORTIONS,
  PANEL_IDS,
  PANEL_TITLES,
  loadDockLayout,
  onDockLayoutReset,
  saveDockLayout,
} from './dockLayout'
import type { PanelId } from './dockLayout'

/** 各パネルの中身。画面（LineEditorPage）が毎回作って渡す */
export type DockPanels = Record<PanelId, ReactNode>

const PanelsContext = createContext<DockPanels | null>(null)

/** dockview が作るパネル。中身は画面から Context で受け取る（部品の一覧は固定しておく必要があるため） */
function DockPanel({ api }: IDockviewPanelProps) {
  const panels = use(PanelsContext)
  const id = api.id as PanelId
  return <div className={`dock-pane dock-pane-${id}`}>{panels?.[id]}</div>
}

const components = Object.fromEntries(PANEL_IDS.map((id) => [id, DockPanel]))

/** 閉じたパネルを戻す手段がないので、タブの × は出さない */
function DockTab(props: IDockviewPanelHeaderProps) {
  return <DockviewDefaultTab {...props} hideClose />
}

// 色は app.css で dockview の変数をアプリの変数に差し替える。テーマのクラスは変数の土台として使うだけ。
// パネルの間の隙間は dockview の gap ではなく app.css の余白で作る。dockview 8.4.1 では gap を付けると、
// 覚えた並びを開くたびに境目が数 px ずつずれていく（再読み込みのたびに一覧が細くなる）ため
const theme: DockviewTheme = { ...themeLight, gap: 0 }

interface DefaultPlacement {
  position?: { referencePanel: PanelId; direction: 'right' | 'below' | 'within' }
  inactive?: boolean
}

/** 初めの並び：左に一覧、右上にプレビュー、その下にアクセント・高さ・長さの束 */
function addDefaultPanels(api: DockviewApi) {
  api.clear()
  const add = (id: PanelId, more: DefaultPlacement = {}) =>
    api.addPanel({ id, component: id, title: PANEL_TITLES[id], ...more })
  add('lines')
  add('preview', { position: { referencePanel: 'lines', direction: 'right' } })
  add('accent', { position: { referencePanel: 'preview', direction: 'below' } })
  add('pitch', { position: { referencePanel: 'accent', direction: 'within' }, inactive: true })
  add('length', { position: { referencePanel: 'accent', direction: 'within' }, inactive: true })
  // 足すたびに等分されるので、並べ終えてから大きさを決める（パネルの周りの余白を含む）
  api.getPanel('lines')?.group.api.setSize({ width: Math.round(api.width * DEFAULT_PROPORTIONS.linesWidth) })
  api.getPanel('accent')?.group.api.setSize({ height: Math.round(api.height * DEFAULT_PROPORTIONS.phraseHeight) })
}

/** 覚えた並び、なければ初めの並びで並べる */
function openLayout(api: DockviewApi) {
  const saved = loadDockLayout()
  try {
    if (saved) api.fromJSON(saved)
    else addDefaultPanels(api)
  } catch {
    // 覚えた並びが今の dockview で読めない（形が壊れている）ときは初めの並びで開く
    addDefaultPanels(api)
  }
}

const isVisible = (element: HTMLElement | null): element is HTMLElement =>
  element !== null && element.clientWidth > 0 && element.clientHeight > 0

/** 1行編集のパネルの置き場。タブをドラッグして分けたり束ねたりでき、並びはブラウザに覚える */
export function LineEditorDock({ panels }: { panels: DockPanels }) {
  const apiRef = useRef<DockviewApi | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const openedRef = useRef(false)

  // 隠れている間（別の画面を開いている間）は大きさが 0 で、パネルの幅・高さを決められない。
  // dockview の準備ができていて、初めて見えたときに並べる（準備と表示のどちらが先でもよいように、両方から呼ぶ）
  const openWhenVisible = useCallback(() => {
    const api = apiRef.current
    const view = viewRef.current
    if (openedRef.current || !api || !isVisible(view)) return
    openedRef.current = true
    // dockview が見えた大きさをまだ受け取っていないことがあるので、先に伝えてからパネルの大きさを決める
    api.layout(view.clientWidth, view.clientHeight)
    openLayout(api)
  }, [])

  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const observer = new ResizeObserver(openWhenVisible)
    observer.observe(element)
    return () => observer.disconnect()
  }, [openWhenVisible])

  // 設定画面の「初めの並びに戻す」。この画面は隠れていて大きさが 0 なので、片付けておいて次に見えたときに並べ直す
  useEffect(
    () =>
      onDockLayoutReset(() => {
        openedRef.current = false
        apiRef.current?.clear()
        openWhenVisible()
      }),
    [openWhenVisible],
  )

  const onReady = ({ api }: DockviewReadyEvent) => {
    apiRef.current = api
    // 開発中のホットリロードでは、この部品の状態（ref）を残したまま dockview だけが空で作り直される。
    // 新しい dockview はまだ何も並べていないので、並べ直す
    openedRef.current = false
    // 並べる前と、隠れて大きさが 0 の間の並びは覚えない（次に開いたとき潰れたままになるため）。
    // 作り直される前の古い dockview からの知らせも、今の並びを上書きしないよう無視する
    api.onDidLayoutChange(() => {
      if (apiRef.current === api && openedRef.current && api.width > 0 && api.height > 0) {
        saveDockLayout(api.toJSON())
      }
    })
    openWhenVisible()
  }

  return (
    <div className="line-dock" ref={rootRef}>
      <PanelsContext value={panels}>
        <DockviewReact
          ref={viewRef}
          className="line-dock-view"
          components={components}
          defaultTabComponent={DockTab}
          theme={theme}
          // 浮かせたパネルは他のパネルを隠してしまうので、並べるだけにする
          disableFloatingGroups
          onReady={onReady}
        />
      </PanelsContext>
    </div>
  )
}
