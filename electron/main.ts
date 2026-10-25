import { app, BrowserWindow, net, protocol, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP_ORIGIN, decideNavigation, resolveAppPath } from './appProtocol'

// ビルド済みの画面（vite build の出力）。dist-electron/main.js から見て一つ上の dist/
const DIST_ROOT = path.resolve(__dirname, '..', 'dist')
const DEV_URL = process.env.ELECTRON_DEV_URL

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  const ownOrigin = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN

  // 外部リンクはアプリ内に開かず、https だけ既定ブラウザへ渡す
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (decideNavigation(url) === 'external') void shell.openExternal(url)
    return { action: 'deny' }
  })
  // 自分のオリジン以外への遷移（リンク・ドロップ等）を止め、必要なら外部ブラウザへ
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === ownOrigin) return
    event.preventDefault()
    if (decideNavigation(url) === 'external') void shell.openExternal(url)
  })

  void win.loadURL(DEV_URL ?? `${APP_ORIGIN}/`)
}

void app.whenReady().then(() => {
  registerAppProtocol()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
