import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Logger } from 'electron-updater'
import { createFileLogger, startSilentUpdates } from '../../electron/updater'

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  logger: Logger | null = null
  checkForUpdates = vi.fn<() => Promise<unknown>>(() => Promise.resolve(null))
}

const silentLogger = () => ({
  info: vi.fn<(message?: unknown) => void>(),
  warn: vi.fn<(message?: unknown) => void>(),
  error: vi.fn<(message?: unknown) => void>(),
})

// 遅らせた呼び出しをテストの側で好きなときに走らせる
function manualTimer() {
  const pending: { fn: () => void; ms: number }[] = []
  return {
    pending,
    setTimer: (fn: () => void, ms: number) => pending.push({ fn, ms }),
    runAll: () => pending.splice(0).forEach(({ fn }) => fn()),
  }
}

const start = (updater: FakeUpdater, opts: { isPackaged: boolean; logger?: Logger; setTimer?: ManualTimer }) =>
  startSilentUpdates({
    // テスト用の偽物。startSilentUpdates が触るのは型にある部分だけ
    updater: updater as unknown as Parameters<typeof startSilentUpdates>[0]['updater'],
    isPackaged: opts.isPackaged,
    logger: opts.logger ?? silentLogger(),
    setTimer: opts.setTimer?.setTimer,
  })
type ManualTimer = ReturnType<typeof manualTimer>

describe('startSilentUpdates', () => {
  test('開発中（パッケージ版でない）は何もしない', () => {
    const updater = new FakeUpdater()
    const timer = manualTimer()
    start(updater, { isPackaged: false, setTimer: timer })
    expect(timer.pending).toHaveLength(0)
    expect(updater.autoDownload).toBe(false)
    expect(updater.listenerCount('error')).toBe(0)
  })

  test('パッケージ版は自動で落とし、終了時に入れ替える設定にして、少し待ってから確認する', async () => {
    const updater = new FakeUpdater()
    const timer = manualTimer()
    start(updater, { isPackaged: true, setTimer: timer })
    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(timer.pending).toHaveLength(1)
    expect(timer.pending[0].ms).toBeGreaterThan(0)
    timer.runAll()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  test('更新の失敗はログに残すだけで、例外にも未処理の reject にもならない', async () => {
    const updater = new FakeUpdater()
    const logger = silentLogger()
    const timer = manualTimer()
    const offline = new Error('net::ERR_INTERNET_DISCONNECTED')
    updater.checkForUpdates.mockImplementation(() => {
      // 本物と同じく、'error' を出してから reject する
      updater.emit('error', offline)
      return Promise.reject(offline)
    })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      start(updater, { isPackaged: true, logger, setTimer: timer })
      timer.runAll()
      await new Promise((r) => setTimeout(r, 0))
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ERR_INTERNET_DISCONNECTED'))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  test('ダウンロードの失敗も未処理の reject にしない', async () => {
    const updater = new FakeUpdater()
    const timer = manualTimer()
    const downloadPromise = Promise.reject(new Error('download failed'))
    updater.checkForUpdates.mockResolvedValue({ downloadPromise })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      start(updater, { isPackaged: true, setTimer: timer })
      timer.runAll()
      await new Promise((r) => setTimeout(r, 0))
      expect(unhandled).not.toHaveBeenCalled()
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

  test('フォルダがなくても作って 1 行ずつ追記する', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'lipsync-updater-'))
    const file = path.join(dir, 'logs', 'updater.log')
    const logger = createFileLogger(file)
    logger.info('Checking for update')
    logger.error('boom')
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/\[info\] Checking for update$/)
    expect(lines[1]).toMatch(/\[error\] boom$/)
  })

  test('書けない場所でも例外を投げない', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'lipsync-updater-'))
    const logger = createFileLogger(path.join(dir, '\0bad', 'updater.log'))
    expect(() => logger.warn('x')).not.toThrow()
  })
})
