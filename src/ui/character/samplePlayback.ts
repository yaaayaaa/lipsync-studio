import type { Vowel } from '../../core/character/types'
import { mouthAt } from '../../core/lipsync/timeline'
import type { MouthTimeline } from '../../core/lipsync/timeline'

export interface AudioLike {
  currentTime: number
  play(): Promise<void>
  pause(): void
  addEventListener(type: 'ended', listener: () => void): void
}

/** ブラウザ API の差し替え口（テストで偽物を渡すため）。 */
export interface PlaybackEnv {
  createUrl(blob: Blob): string
  revokeUrl(url: string): void
  createAudio(url: string): AudioLike
  requestFrame(callback: () => void): number
  cancelFrame(id: number): void
}

export const browserPlaybackEnv: PlaybackEnv = {
  createUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
  createAudio: (url) => new Audio(url),
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => cancelAnimationFrame(id),
}

export interface PlaybackCallbacks {
  /** time は再生位置（audio.currentTime、秒） */
  onMouth(vowel: Vowel, time: number): void
  /** audio.play() が通り、口を動かし始めたとき */
  onPlaying(): void
}

export interface PlaybackHandle {
  /** 何度呼んでもよい。以後は音も口のコールバックも出ない */
  cancel(): void
  /** 最後まで再生したら 'ended'、取り消したら 'cancelled'。合成や再生の失敗は reject（取り消し後は除く） */
  done: Promise<'ended' | 'cancelled'>
}

export type LoadSample = () => Promise<{ wav: ArrayBuffer; timeline: MouthTimeline }>

/**
 * 合成→再生→口の駆動を、どの await の後でも取り消せるように進める。
 * 取り消しは画面を離れたときと、次の再生を始めたときに呼ぶ。
 */
export function startSamplePlayback(load: LoadSample, env: PlaybackEnv, cb: PlaybackCallbacks): PlaybackHandle {
  let cancelled = false
  let release: (() => void) | null = null
  let signalCancel!: () => void
  const cancelledSignal = new Promise<'cancelled'>((resolve) => {
    signalCancel = () => resolve('cancelled')
  })

  const cleanUp = () => {
    release?.()
    release = null
  }

  const run = async (): Promise<'ended' | 'cancelled'> => {
    const { wav, timeline } = await load()
    if (cancelled) return 'cancelled'

    const url = env.createUrl(new Blob([wav], { type: 'audio/wav' }))
    const audio = env.createAudio(url)
    let frame: number | null = null
    release = () => {
      if (frame !== null) env.cancelFrame(frame)
      frame = null
      audio.pause()
      env.revokeUrl(url)
    }
    const ended = new Promise<'ended'>((resolve) => audio.addEventListener('ended', () => resolve('ended')))

    await audio.play()
    if (cancelled) return 'cancelled'

    cb.onPlaying()
    const tick = () => {
      if (cancelled) return
      const time = audio.currentTime
      cb.onMouth(mouthAt(timeline, time), time)
      frame = env.requestFrame(tick)
    }
    tick()
    return Promise.race([ended, cancelledSignal])
  }

  const done = run().then(
    (result) => {
      cleanUp()
      return cancelled ? 'cancelled' : result
    },
    (e: unknown) => {
      cleanUp()
      if (cancelled) return 'cancelled' as const
      throw e
    },
  )

  return {
    cancel() {
      if (cancelled) return
      cancelled = true
      cleanUp()
      signalCancel()
    },
    done,
  }
}
