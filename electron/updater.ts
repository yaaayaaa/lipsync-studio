import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import type { AppUpdater, Logger } from 'electron-updater'

// 起動直後はウィンドウの読み込みと重なるので、少し待ってから GitHub に問い合わせる
export const UPDATE_CHECK_DELAY_MS = 10_000
// 問い合わせやダウンロードに失敗したら、この間隔で取り直す。一時的な不調（GitHub の 5xx・回線の瞬断）は
// 数分で戻ることが多い。使い切ったら次の起動まで待つ（ずっとオフラインの人に問い合わせを続けない）
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000]
// 開いたままにする人もいるので、成功した後もこの間隔で新しい版を確かめる
export const PERIODIC_CHECK_MS = 6 * 60 * 60_000
// ログは調べるときに読むためだけのもの。増え続けないよう、この大きさを超えたら一つ前の世代に回す
const MAX_LOG_BYTES = 1_000_000

type SilentUpdater = Pick<
  AppUpdater,
  'autoDownload' | 'autoInstallOnAppQuit' | 'disableWebInstaller' | 'logger' | 'checkForUpdates'
>

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
 * 利用者には何も知らせない。失敗（オフライン・GitHub の不調など）もログに残すだけで画面には出さない。
 * 失敗したら間隔を空けて取り直し、成功したら数時間おきに確かめる。落とし終えたら、入れ替わる終了の時まで確かめない
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
  // 配っているのは普通のインストーラーだけ。web インストーラー用の取り扱いは要らない
  updater.disableWebInstaller = true
  // 失敗は electron-updater 自身が 'error' の受け手で logger に書く（受け手があるので EventEmitter は例外を投げない）
  updater.logger = logger

  let failures = 0
  // 前の確認が終わってから次を予約するので、確認が重なることはない
  const check = async () => {
    try {
      const result = await updater.checkForUpdates()
      if (result?.downloadPromise) {
        await result.downloadPromise
        // 落とし終えた。入れ替えは終了時に起きるので、これ以上は確かめない
        return
      }
      failures = 0
      setTimer(run, PERIODIC_CHECK_MS)
    } catch {
      // 失敗の中身は 'error' として electron-updater が記録済み
      const delay = RETRY_DELAYS_MS[failures]
      failures++
      if (delay === undefined) {
        logger.warn('更新の確認を次の起動まで止めます（取り直しをすべて失敗しました）')
        return
      }
      logger.info(`更新の確認を ${Math.round(delay / 60_000)} 分後に取り直します`)
      setTimer(run, delay)
    }
  }
  const run = () => void check()
  setTimer(run, delayMs)
}

/**
 * logs フォルダに 1 行ずつ追記するだけのロガー。main プロセスを止めないよう、書き込みは非同期で順番に行う。
 * debug は持たない（差分ダウンロードの計画を丸ごと文字列にするなど、重いうえに調べるときにも要らない）。
 * 書けなくてもアプリの動作は止めない
 */
export function createFileLogger(file: string): Logger & { flushed(): Promise<void> } {
  let queue: Promise<void> = Promise.resolve()
  // 世代交代に失敗したまま書き続けると際限なく大きくなるので、この大きさで書くのをやめる
  let rotationFailed = false

  const writeLine = async (line: string) => {
    await mkdir(path.dirname(file), { recursive: true })
    const size = await stat(file).then(
      (s) => s.size,
      () => 0,
    )
    if (size > MAX_LOG_BYTES) {
      try {
        await rename(file, `${file}.old`)
        rotationFailed = false
      } catch (e) {
        if (size > MAX_LOG_BYTES * 2) return
        if (!rotationFailed) {
          rotationFailed = true
          // 失敗を黙って捨てず、ログ自身に残す（以降はこの1回だけ）
          line = `${new Date().toISOString()} [warn] ログの世代交代に失敗しました: ${String(e)}\n${line}`
        }
      }
    }
    await appendFile(file, line)
  }

  const write = (level: string, message: unknown) => {
    const line = `${new Date().toISOString()} [${level}] ${String(message)}\n`
    queue = queue
      .then(() => writeLine(line))
      .catch(() => {
        // ログが書けないのは更新の失敗よりさらに重要度が低い。アプリの動作を優先する
      })
  }
  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
    // テストで書き終わりを待つため
    flushed: () => queue,
  }
}
