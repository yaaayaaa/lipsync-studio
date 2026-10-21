import { describe, expect, it, vi } from 'vitest'
import type { MouthTimeline } from '../../../src/core/lipsync/timeline'
import { startSamplePlayback } from '../../../src/ui/character/samplePlayback'
import type { PlaybackEnv } from '../../../src/ui/character/samplePlayback'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const timeline: MouthTimeline = { segments: [{ start: 0, end: 1, vowel: 'a' }], duration: 1 }

function fakeEnv() {
  const play = deferred<void>()
  let ended: (() => void) | null = null
  const audio = {
    currentTime: 0.5,
    duration: 1.2,
    play: vi.fn(() => play.promise),
    pause: vi.fn(),
    addEventListener: vi.fn((_type: 'ended', fn: () => void) => {
      ended = fn
    }),
  }
  const frames: (() => void)[] = []
  const env: PlaybackEnv = {
    createUrl: vi.fn(() => 'blob:x'),
    revokeUrl: vi.fn(),
    createAudio: vi.fn(() => audio),
    requestFrame: vi.fn((cb: () => void) => frames.push(cb)),
    cancelFrame: vi.fn(),
  }
  return { env, audio, play, frames, end: () => ended?.() }
}

const callbacks = () => ({ onMouth: vi.fn(), onPlaying: vi.fn() })

describe('startSamplePlayback', () => {
  it('cancelled during synthesis: never creates audio, plays or schedules frames', async () => {
    const { env } = fakeEnv()
    const load = deferred<{ wav: ArrayBuffer; timeline: MouthTimeline }>()
    const cb = callbacks()
    const handle = startSamplePlayback(() => load.promise, env, cb)
    handle.cancel()
    load.resolve({ wav: new ArrayBuffer(8), timeline })
    await expect(handle.done).resolves.toBe('cancelled')
    expect(env.createUrl).not.toHaveBeenCalled()
    expect(env.createAudio).not.toHaveBeenCalled()
    expect(env.requestFrame).not.toHaveBeenCalled()
    expect(cb.onPlaying).not.toHaveBeenCalled()
    expect(cb.onMouth).not.toHaveBeenCalled()
  })

  it('cancelled while play() is pending: pauses, revokes, and starts no frame loop', async () => {
    const { env, audio, play } = fakeEnv()
    const cb = callbacks()
    const handle = startSamplePlayback(async () => ({ wav: new ArrayBuffer(8), timeline }), env, cb)
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalled())
    handle.cancel()
    expect(audio.pause).toHaveBeenCalled()
    expect(env.revokeUrl).toHaveBeenCalledWith('blob:x')
    play.resolve()
    await expect(handle.done).resolves.toBe('cancelled')
    expect(env.requestFrame).not.toHaveBeenCalled()
    expect(cb.onPlaying).not.toHaveBeenCalled()
  })

  it('cancelled while playing: stops the frame loop and cleans up once', async () => {
    const { env, audio, play, frames } = fakeEnv()
    const cb = callbacks()
    const handle = startSamplePlayback(async () => ({ wav: new ArrayBuffer(8), timeline }), env, cb)
    play.resolve()
    await vi.waitFor(() => expect(cb.onPlaying).toHaveBeenCalled())
    expect(cb.onMouth).toHaveBeenLastCalledWith('a', 0.5)
    handle.cancel()
    handle.cancel()
    expect(env.cancelFrame).toHaveBeenCalledTimes(1)
    expect(env.revokeUrl).toHaveBeenCalledTimes(1)
    expect(audio.pause).toHaveBeenCalledTimes(1)
    // 取り消し前に予約済みのフレームが来ても、次を予約しない
    const scheduled = vi.mocked(env.requestFrame).mock.calls.length
    frames.at(-1)!()
    expect(env.requestFrame).toHaveBeenCalledTimes(scheduled)
    await expect(handle.done).resolves.toBe('cancelled')
  })

  it('plays to the end, drives the mouth, then cleans up', async () => {
    const { env, play, end } = fakeEnv()
    const cb = callbacks()
    const handle = startSamplePlayback(async () => ({ wav: new ArrayBuffer(8), timeline }), env, cb)
    play.resolve()
    await vi.waitFor(() => expect(cb.onPlaying).toHaveBeenCalled())
    expect(cb.onMouth).toHaveBeenCalledWith('a', 0.5)
    end()
    await expect(handle.done).resolves.toBe('ended')
    expect(env.revokeUrl).toHaveBeenCalledWith('blob:x')
    expect(env.cancelFrame).toHaveBeenCalled()
  })

  it('rejects with the load error, but not after cancel', async () => {
    const { env } = fakeEnv()
    const failing = startSamplePlayback(() => Promise.reject(new Error('VOICEVOX down')), env, callbacks())
    await expect(failing.done).rejects.toThrow('VOICEVOX down')

    const load = deferred<{ wav: ArrayBuffer; timeline: MouthTimeline }>()
    const cancelled = startSamplePlayback(() => load.promise, env, callbacks())
    cancelled.cancel()
    load.reject(new Error('late failure'))
    await expect(cancelled.done).resolves.toBe('cancelled')
  })

  it('a rejected play() cleans up and rejects', async () => {
    const { env, audio, play } = fakeEnv()
    const handle = startSamplePlayback(async () => ({ wav: new ArrayBuffer(8), timeline }), env, callbacks())
    play.reject(new Error('NotAllowedError'))
    await expect(handle.done).rejects.toThrow('NotAllowedError')
    expect(audio.pause).toHaveBeenCalled()
    expect(env.revokeUrl).toHaveBeenCalledWith('blob:x')
  })

  it('reports the audio length when playing starts', async () => {
    const { env, play } = fakeEnv()
    const cb = callbacks()
    startSamplePlayback(async () => ({ wav: new ArrayBuffer(8), timeline }), env, cb)
    play.resolve()
    await vi.waitFor(() => expect(cb.onPlaying).toHaveBeenCalledWith(1.2))
  })

  it('falls back to the timeline length when the audio length is unknown', async () => {
    const { env, audio, play } = fakeEnv()
    audio.duration = Number.NaN
    const cb = callbacks()
    startSamplePlayback(async () => ({ wav: new ArrayBuffer(8), timeline }), env, cb)
    play.resolve()
    await vi.waitFor(() => expect(cb.onPlaying).toHaveBeenCalledWith(1))
  })

  it('starts at startAt, and a seek during synthesis replaces it', async () => {
    const { env, audio } = fakeEnv()
    audio.currentTime = 0
    startSamplePlayback(async () => ({ wav: new ArrayBuffer(8), timeline }), env, callbacks(), { startAt: 0.4 })
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalled())
    expect(audio.currentTime).toBe(0.4)

    const second = fakeEnv()
    second.audio.currentTime = 0
    const load = deferred<{ wav: ArrayBuffer; timeline: MouthTimeline }>()
    const handle = startSamplePlayback(() => load.promise, second.env, callbacks(), { startAt: 0.4 })
    handle.seek(0.7)
    load.resolve({ wav: new ArrayBuffer(8), timeline })
    await vi.waitFor(() => expect(second.audio.play).toHaveBeenCalled())
    expect(second.audio.currentTime).toBe(0.7)
  })

  it('moves the audio while playing, and ignores seeks after cancel', async () => {
    const { env, audio, play } = fakeEnv()
    const cb = callbacks()
    const handle = startSamplePlayback(async () => ({ wav: new ArrayBuffer(8), timeline }), env, cb)
    play.resolve()
    await vi.waitFor(() => expect(cb.onPlaying).toHaveBeenCalled())
    handle.seek(0.9)
    expect(audio.currentTime).toBe(0.9)
    handle.seek(-1)
    expect(audio.currentTime).toBe(0)
    handle.cancel()
    handle.seek(0.3)
    expect(audio.currentTime).toBe(0)
  })
})
