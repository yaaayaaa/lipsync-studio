import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { autoUpdater } from 'electron-updater'
import { APP_ORIGIN, decideNavigation, isSameOrigin, resolveAppPath } from './appProtocol'
import { isAllowedEngineRequest, parseEngineRequest } from './engineRequest'
import type { EngineResponse } from './engineTypes'
import { createFileLogger, startSilentUpdates } from './updater'

// ビルド済みの画面（vite build の出力）。dist-electron/main.js から見て一つ上の dist/
const DIST_ROOT = path.resolve(__dirname, '..', 'dist')
const DEV_URL = process.env.ELECTRON_DEV_URL
// 画面のオリジン。遷移の判定と、IPC を受け付ける相手の判定に使う
const OWN_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN
// renderer 側の合成のタイムアウト（120 秒）より長くする。先に main が切ると、
// 遅いエンジンで「タイムアウト」ではなく「接続できません」と出てしまうため
const ENGINE_FETCH_TIMEOUT_MS = 150_000

// 独自スキームを標準・セキュア扱いにする。IndexedDB / WebCodecs / fetch が使える
// isSecureContext にするため。app.whenReady より前に呼ぶ必要がある
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
  },
])

function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const file = resolveAppPath(new URL(request.url).pathname, DIST_ROOT)
    if (file === null || !existsSync(file) || !statSync(file).isFile()) {
      return new Response('Not Found', { status: 404 })
    }
    return net.fetch(pathToFileURL(file).toString())
  })
}

// renderer の fetch を main で代行する。初期設定の VOICEVOX エンジンは CORS で app:// を通さないが、
// main の net.fetch は CORS の対象外なので、エンジンの設定を変えずにつながる
function registerEngineFetch() {
  ipcMain.handle('engine:fetch', async (event, raw: unknown): Promise<EngineResponse> => {
    // 自分の画面以外（万一読み込まれた別オリジンのフレーム等）からの依頼は受けない
    const senderUrl = event.senderFrame?.url ?? ''
    if (!isSameOrigin(senderUrl, OWN_ORIGIN)) throw new Error(`engine:fetch を拒否しました（送信元 ${senderUrl}）`)
    const req = parseEngineRequest(raw)
    if (req === null) throw new Error('engine:fetch の依頼の形が不正です')
    if (!isAllowedEngineRequest(req)) throw new Error(`engine:fetch で許可されていない URL です (${req.url})`)

    const res = await net.fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      // 転送先で許可リストを回避されないよう、リダイレクトは追わずに失敗にする
      redirect: 'error',
      signal: AbortSignal.timeout(ENGINE_FETCH_TIMEOUT_MS),
    })
    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers),
      body: await res.arrayBuffer(),
    }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // 外部リンクはアプリ内に開かず、https だけ既定ブラウザへ渡す
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (decideNavigation(url) === 'external') void shell.openExternal(url)
    return { action: 'deny' }
  })
  // 自分のオリジン以外への遷移（リンク・ドロップ等）を止め、必要なら外部ブラウザへ
  win.webContents.on('will-navigate', (event, url) => {
    if (isSameOrigin(url, OWN_ORIGIN)) return
    event.preventDefault()
    if (decideNavigation(url) === 'external') void shell.openExternal(url)
  })

  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/`)
}

// 同じ userData を二つの起動が同時に使うと、後から開いた側は IndexedDB を開けず、
// キャラ・台本・設定が消えたように見える。終了時の更新（Windows のインストーラー）とも競合する。
// そのため 2 つ目の起動は何もせずに終わり、先に開いている窓を前に出す
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 起動の途中なら、このあと whenReady で窓ができるので何もしない
    if (!app.isReady()) return
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) {
      // Mac で窓を閉じてアプリだけ残っているとき
      createWindow()
      return
    }
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  void app.whenReady().then(() => {
    registerAppProtocol()
    registerEngineFetch()
    createWindow()
    // Mac は ~/Library/Logs/lipsync-studio/、Windows は %APPDATA%\lipsync-studio\logs\ に残る
    startSilentUpdates({
      updater: autoUpdater,
      isPackaged: app.isPackaged,
      logger: createFileLogger(path.join(app.getPath('logs'), 'updater.log')),
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
