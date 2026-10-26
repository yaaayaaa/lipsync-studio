import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import type { AppUpdater, Logger } from 'electron-updater'

// 起動直後はウィンドウの読み込みと重なるので、少し待ってから GitHub に問い合わせる
export const UPDATE_CHECK_DELAY_MS = 10_000
// ログは調べるときに読むためだけのもの。増え続けないよう、この大きさを超えたら一つ前の世代に回す
const MAX_LOG_BYTES = 1_000_000

type SilentUpdater = Pick<AppUpdater, 'autoDownload' | 'autoInstallOnAppQuit' | 'logger' | 'checkForUpdates'>

export interface SilentUpdateOptions {
  updater: SilentUpdater
  // 開発中（electron . で動かしているとき）は更新しない。パッケージ版だけが GitHub Releases の版を持つため
  isPackaged: boolean
  logger: Logger
  delayMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
}

/**
 * 更新を黙って取りに行く。新しい版があれば裏で落とし、次にアプリを終了したときに入れ替える。
 * 利用者には何も知らせない。失敗（オフライン・GitHub の不調など）もログに残すだけで画面には出さない
 */
export function startSilentUpdates({
  updater,
  isPackaged,
  logger,
  delayMs = UPDATE_CHECK_DELAY_MS,
  setTimer = setTimeout,
}: SilentUpdateOptions): void {
  if (!isPackaged) return

  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  // 失敗は electron-updater 自身が 'error' の受け手で logger に書く（受け手があるので EventEmitter は例外を投げない）
  updater.logger = logger

  setTimer(() => {
    updater
      .checkForUpdates()
      .then((result) => {
        // ダウンロードの失敗は 'error' として記録済み。未処理の reject として残さない
        result?.downloadPromise?.catch(() => {})
      })
      .catch(() => {
        // 問い合わせの失敗も 'error' で記録済み
      })
  }, delayMs)
}

/** userData とは別の logs フォルダに 1 行ずつ追記するだけのロガー。書けなくても動作は止めない */
export function createFileLogger(file: string): Logger {
  const write = (level: string, message: unknown) => {
    try {
      mkdirSync(path.dirname(file), { recursive: true })
      try {
        if (statSync(file).size > MAX_LOG_BYTES) renameSync(file, `${file}.old`)
      } catch {
        // まだファイルがない
      }
      appendFileSync(file, `${new Date().toISOString()} [${level}] ${String(message)}\n`)
    } catch {
      // ログが書けないのは更新の失敗よりさらに重要度が低い。アプリの動作を優先する
    }
  }
  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
    debug: (message) => write('debug', message),
  }
}
