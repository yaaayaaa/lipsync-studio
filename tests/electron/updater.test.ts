import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Logger } from 'electron-updater'
import {
  PERIODIC_CHECK_MS,
  RETRY_DELAYS_MS,
  UPDATE_CHECK_DELAY_MS,
  createFileLogger,
  startSilentUpdates,
} from '../../electron/updater'

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  disableWebInstaller = false
  logger: Logger | null = null
  constructor() {
    super()
    // 本物の AppUpdater と同じく、'error' を自分の logger に書く受け手を最初から持つ
    this.on('error', (error: Error) => this.logger?.error(`Error: ${error.stack ?? error.message}`))
  }
  checkForUpdates = vi.fn<() => Promise<unknown>>(() => Promise.resolve(null))
}

const silentLogger = () => ({
  info: vi.fn<(message?: unknown) => void>(),
  warn: vi.fn<(message?: unknown) => void>(),
  error: vi.fn<(message?: unknown) => void>(),
})

// 遅らせた呼び出しをテストの側で1つずつ走らせる
function manualTimer() {
  const pending: { fn: () => void; ms: number }[] = []
  return {
    pending,
    setTimer: (fn: () => void, ms: number) => pending.push({ fn, ms }),
    /** 予約されている呼び出しを1つ走らせ、その確認が終わるのを待つ */
    async runNext() {
      const next = pending.shift()
      if (!next) throw new Error('予約がありません')
      next.fn()
      await new Promise((r) => setTimeout(r, 0))
      return next.ms
    },
  }
}
type ManualTimer = ReturnType<typeof manualTimer>

const start = (updater: FakeUpdater, opts: { isPackaged: boolean; logger?: Logger; timer?: ManualTimer }) =>
  startSilentUpdates({
    // テスト用の偽物。startSilentUpdates が触るのは型にある部分だけ
    updater: updater as unknown as Parameters<typeof startSilentUpdates>[0]['updater'],
    isPackaged: opts.isPackaged,
    logger: opts.logger ?? silentLogger(),
    setTimer: opts.timer?.setTimer,
  })

// 本物と同じく、'error' を出してから reject する
const failingCheck = (updater: FakeUpdater) => () => {
  const offline = new Error('net::ERR_INTERNET_DISCONNECTED')
  updater.emit('error', offline)
  return Promise.reject(offline)
}

describe('startSilentUpdates', () => {
  test('開発中（パッケージ版でない）は何もしない', () => {
    const updater = new FakeUpdater()
    const timer = manualTimer()
    start(updater, { isPackaged: false, timer })
    expect(timer.pending).toHaveLength(0)
    expect(updater.autoDownload).toBe(false)
    expect(updater.logger).toBeNull()
  })

  test('パッケージ版は黙って落として終了時に入れ替える設定にし、少し待ってから確認する', async () => {
    const updater = new FakeUpdater()
    const logger = silentLogger()
    const timer = manualTimer()
    start(updater, { isPackaged: true, logger, timer })
    expect(updater.logger).toBe(logger)
    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.disableWebInstaller).toBe(true)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(await timer.runNext()).toBe(UPDATE_CHECK_DELAY_MS)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  test('新しい版がなければ、数時間おきに確かめ続ける', async () => {
    const updater = new FakeUpdater()
    const timer = manualTimer()
    start(updater, { isPackaged: true, timer })
    await timer.runNext()
    expect(timer.pending.map((p) => p.ms)).toEqual([PERIODIC_CHECK_MS])
    await timer.runNext()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(timer.pending.map((p) => p.ms)).toEqual([PERIODIC_CHECK_MS])
  })

  test('落とし終えたら、それ以上は確かめない（入れ替えは終了時）', async () => {
    const updater = new FakeUpdater()
    const timer = manualTimer()
    updater.checkForUpdates.mockResolvedValue({ downloadPromise: Promise.resolve(['update.zip']) })
    start(updater, { isPackaged: true, timer })
    await timer.runNext()
    expect(timer.pending).toHaveLength(0)
  })

  test('確認に失敗したら 1・5・15 分後に取り直し、それでもだめなら次の起動まで止める', async () => {
    const updater = new FakeUpdater()
    const logger = silentLogger()
    const timer = manualTimer()
    updater.checkForUpdates.mockImplementation(failingCheck(updater))
    start(updater, { isPackaged: true, logger, timer })
    await timer.runNext()
    const delays: number[] = []
    while (timer.pending.length > 0) delays.push(await timer.runNext())
    expect(RETRY_DELAYS_MS).toEqual([60_000, 300_000, 900_000])
    expect(delays).toEqual(RETRY_DELAYS_MS)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1 + RETRY_DELAYS_MS.length)
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ERR_INTERNET_DISCONNECTED'))
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('次の起動まで'))
  })

  test('取り直しで成功したら、失敗の回数を数え直して定期の確認に戻る', async () => {
    const updater = new FakeUpdater()
    const timer = manualTimer()
    updater.checkForUpdates.mockImplementationOnce(failingCheck(updater))
    start(updater, { isPackaged: true, timer })
    await timer.runNext()
    expect(timer.pending.map((p) => p.ms)).toEqual([RETRY_DELAYS_MS[0]])
    await timer.runNext()
    expect(timer.pending.map((p) => p.ms)).toEqual([PERIODIC_CHECK_MS])
    // 次にまた失敗したら、最初の間隔（1 分）から始める
    updater.checkForUpdates.mockImplementationOnce(failingCheck(updater))
    await timer.runNext()
    expect(timer.pending.map((p) => p.ms)).toEqual([RETRY_DELAYS_MS[0]])
  })

  test('ダウンロードの失敗も取り直し、未処理の reject にしない', async () => {
    const updater = new FakeUpdater()
    const timer = manualTimer()
    updater.checkForUpdates.mockImplementationOnce(() =>
      Promise.resolve({ downloadPromise: Promise.reject(new Error('download failed')) }),
    )
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      start(updater, { isPackaged: true, timer })
      await timer.runNext()
      await new Promise((r) => setTimeout(r, 0))
      expect(unhandled).not.toHaveBeenCalled()
      expect(timer.pending.map((p) => p.ms)).toEqual([RETRY_DELAYS_MS[0]])
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})

describe('createFileLogger', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })
  const tempDir = () => (dir = mkdtempSync(path.join(tmpdir(), 'lipsync-updater-')))

  test('フォルダがなくても作り、呼んだ順に 1 行ずつ追記する', async () => {
    const file = path.join(tempDir(), 'logs', 'updater.log')
    const logger = createFileLogger(file)
    logger.info('Checking for update')
    logger.error('boom')
    logger.warn('later')
    await logger.flushed()
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/\[info\] Checking for update$/)
    expect(lines[1]).toMatch(/\[error\] boom$/)
    expect(lines[2]).toMatch(/\[warn\] later$/)
  })

  test('debug は持たない（electron-updater が重い debug 出力を作らないように）', () => {
    expect(createFileLogger(path.join(tempDir(), 'updater.log')).debug).toBeUndefined()
  })

  test('大きくなったら一つ前の世代に回す', async () => {
    const file = path.join(tempDir(), 'updater.log')
    writeFileSync(file, 'x'.repeat(1_000_001))
    const logger = createFileLogger(file)
    logger.info('new')
    await logger.flushed()
    expect(readFileSync(`${file}.old`, 'utf8')).toHaveLength(1_000_001)
    expect(readFileSync(file, 'utf8')).toMatch(/\[info\] new\n$/)
  })

  test('世代交代に失敗したら、そのことをログに残して書き続ける', async () => {
    const file = path.join(tempDir(), 'updater.log')
    writeFileSync(file, 'x'.repeat(1_000_001))
    // .old の場所にフォルダ（中身あり）があると rename が失敗する
    mkdirSync(`${file}.old`)
    writeFileSync(path.join(`${file}.old`, 'keep'), '')
    const logger = createFileLogger(file)
    logger.info('first')
    logger.info('second')
    await logger.flushed()
    const tail = readFileSync(file, 'utf8').slice(1_000_001).trim().split('\n')
    expect(tail[0]).toMatch(/\[warn\] ログの世代交代に失敗しました/)
    expect(tail.slice(1).map((l) => l.replace(/^\S+ /, ''))).toEqual(['[info] first', '[info] second'])
  })

  test('書けない場所でも例外を投げない', async () => {
    const logger = createFileLogger(path.join(tempDir(), '\0bad', 'updater.log'))
    expect(() => logger.warn('x')).not.toThrow()
    await expect(logger.flushed()).resolves.toBeUndefined()
  })
})
