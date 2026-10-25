import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopBridge } from './engineTypes'

// sandbox: true の preload は 'electron' 以外を require できないので、このファイルだけで完結させる
// （型の import は出力時に消える）。renderer に渡すのはエンジン通信の窓口ひとつだけ
const bridge: DesktopBridge = {
  engineFetch: (req) => ipcRenderer.invoke('engine:fetch', req),
}

contextBridge.exposeInMainWorld('lipsyncDesktop', bridge)
