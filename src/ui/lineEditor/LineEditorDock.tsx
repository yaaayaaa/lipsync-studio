import { createContext, use, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { DockviewDefaultTab, DockviewReact, themeLight } from 'dockview-react'
import type {
  DockviewApi,
  DockviewWillShowOverlayLocationEvent,
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
import { dropGapAtX, gapX, isNoOpDrop } from './tabDrop'

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
// タブを別のタブに重ねたときの入る位置は、タブの半分を塗る四角ではなく、タブの間の細い線で示す
// （四角だと場所を空けているように見え、元の位置に戻るだけのときも何かが起きそうに見えるため）
const theme: DockviewTheme = { ...themeLight, gap: 0, dndTabIndicator: 'line' }

interface DefaultPlacement {
  /** referencePanel がなければ、画面全体の端に足す */
  position?: { referencePanel: PanelId; direction: 'right' | 'above' | 'below' | 'within' } | { direction: 'right' }
  inactive?: boolean
}

/** 初めの並び：左に一覧、真ん中の列に上からセリフ・プレビュー・アクセントの束、右の列に数値 */
function addDefaultPanels(api: DockviewApi) {
  api.clear()
  const add = (id: PanelId, more: DefaultPlacement = {}) =>
    api.addPanel({ id, component: id, title: PANEL_TITLES[id], ...more })
  add('lines')
  add('preview', { position: { referencePanel: 'lines', direction: 'right' } })
  add('text', { position: { referencePanel: 'preview', direction: 'above' } })
  add('accent', { position: { referencePanel: 'preview', direction: 'below' } })
  add('pitch', { position: { referencePanel: 'accent', direction: 'within' }, inactive: true })
  add('length', { position: { referencePanel: 'accent', direction: 'within' }, inactive: true })
  // 右端に、上から下まで通しの列を足す
  add('params', { position: { direction: 'right' } })
  // 足すたびに等分されるので、並べ終えてから大きさを決める（パネルの周りの余白を含む）。
  // 大きさを変えると隣のパネルが伸び縮みするので、真ん中の列とプレビューが残りを受け持つ順に決める
  const size = (id: PanelId, box: { width?: number; height?: number }) => api.getPanel(id)?.group.api.setSize(box)
  const { width, height } = api
  size('lines', { width: Math.round(width * DEFAULT_PROPORTIONS.linesWidth) })
  size('params', { width: Math.round(width * DEFAULT_PROPORTIONS.paramsWidth) })
  size('text', { height: Math.round(height * DEFAULT_PROPORTIONS.textHeight) })
  size('accent', { height: Math.round(height * DEFAULT_PROPORTIONS.phraseHeight) })
}

type DockGroup = NonNullable<DockviewWillShowOverlayLocationEvent['group']>

/** タブの帯に重ねているときの、束のタブ（並び順）とその位置。帯の外（パネルの中身や画面の端）なら null */
function tabStrip(
  event: DockviewWillShowOverlayLocationEvent,
): { group: DockGroup; tabs: string[]; rects: DOMRect[] } | null {
  const group = event.group
  if (!group || (event.kind !== 'tab' && event.kind !== 'header_space')) return null
  const tabs = group.panels.map((p) => p.id)
  const rects = tabs.map((id) =>
    group.element.querySelector(`[data-tab-panel-id="${CSS.escape(id)}"]`)?.getBoundingClientRect(),
  )
  return rects.every((r) => r !== undefined) ? { group, tabs, rects } : null
}

/** 入る位置の知らせが来なくなってから線を消すまで。タブの境目で知らせが1回抜けても線がちらつかない長さ */
const DROP_LINE_GRACE_MS = 100

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
  const dropLineRef = useRef<HTMLDivElement>(null)
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

  // 入る位置の線は、dockview が入る位置を知らせてきたときだけ引く。知らせが来ない所（帯の外・ドラッグしているタブ
  // 自身の上）で線が残らないよう、ドラッグが動いてから少しの間（DROP_LINE_GRACE_MS）知らせがなければ消す。
  // 動くたびにすぐ消すと、タブの境目をまたぐときなど知らせが1回抜けただけで線がちらつくため、少し待つ。
  // 離したとき・やめたときはすぐ消す。dockview はマウスでは HTML5 のドラッグ、タッチとペンではポインタのイベントで
  // 動かすので、両方を見る
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideDropLine = useCallback(() => {
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
    if (dropLineRef.current) dropLineRef.current.hidden = true
  }, [])

  useEffect(() => {
    const hideSoon = () => {
      if (hideTimerRef.current !== null || dropLineRef.current?.hidden !== false) return
      hideTimerRef.current = setTimeout(hideDropLine, DROP_LINE_GRACE_MS)
    }
    const moves = ['dragover', 'pointermove']
    const ends = ['drop', 'dragend', 'pointerup', 'pointercancel']
    for (const type of moves) document.addEventListener(type, hideSoon, { capture: true })
    for (const type of ends) document.addEventListener(type, hideDropLine, { capture: true })
    return () => {
      for (const type of moves) document.removeEventListener(type, hideSoon, { capture: true })
      for (const type of ends) document.removeEventListener(type, hideDropLine, { capture: true })
      hideDropLine()
    }
  }, [hideDropLine])

  /**
   * タブを帯に重ねたときの入る位置の線。dockview は線を重ねている先のタブの内側に描き、同じ境目でも
   * 「前のタブの後ろ」と「次のタブの前」で位置が分かれるので、dockview の線は隠して（app.css）、境目の真上に1本だけ引く。
   * 離しても並びが変わらない位置では、線を出さず、離しても何もしない
   */
  const showTabDropLine = (event: DockviewWillShowOverlayLocationEvent) => {
    const line = dropLineRef.current
    const root = rootRef.current
    if (!line || !root) return
    const strip = tabStrip(event)
    const header = strip?.group.element.querySelector('.dv-tabs-and-actions-container')
    if (!strip || !header) {
      hideDropLine()
      return
    }
    const { group, tabs, rects } = strip
    // 入る位置はポインタの横位置だけから決める（タブの右の空きなら、どのタブよりも右なので最後の後ろ）
    const gap = dropGapAtX(rects, event.nativeEvent.clientX)
    const dragged = event.getData()
    if (dragged?.panelId && dragged.groupId === group.id && isNoOpDrop(tabs, dragged.panelId, gap)) {
      event.preventDefault()
      hideDropLine()
      return
    }
    const x = gapX(rects, gap)
    if (x === null) {
      hideDropLine()
      return
    }
    const rootBox = root.getBoundingClientRect()
    const headerBox = header.getBoundingClientRect()
    // 先頭の前の線（2px）はパネルの枠と重なって見えなくなるので、枠の内側に寄せる
    line.style.left = `${Math.max(x, headerBox.left + 2) - rootBox.left}px`
    line.style.top = `${headerBox.top - rootBox.top}px`
    line.style.height = `${headerBox.height}px`
    // 次の知らせを待って消そうとしていた分は取り消す
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
    line.hidden = false
  }

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
    api.onWillShowOverlay(showTabDropLine)
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
      <div ref={dropLineRef} className="line-dock-drop-line" hidden aria-hidden />
    </div>
  )
}
