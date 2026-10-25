import type { DesktopBridge } from '../electron/engineTypes'

declare global {
  interface Window {
    /** デスクトップ版（Electron）の preload が渡す窓口。ブラウザで開発しているときは無い */
    lipsyncDesktop?: DesktopBridge
  }
}

export {}
