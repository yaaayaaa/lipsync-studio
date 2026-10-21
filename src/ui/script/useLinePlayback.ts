import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScriptLine } from '../../core/character/types'
import type { FrameKey } from '../../core/export/frames'
import { FPS, frameSchedule, lineFrameKeys } from '../../core/export/frames'
import { browserPlaybackEnv, startSamplePlayback } from '../character/samplePlayback'
import type { PlaybackHandle } from '../character/samplePlayback'
import { useApp } from '../useApp'
import type { PreviewFrame } from './LinePreview'
import { errorMessage, resolveLine } from './lineJobs'
import { createPositionStore, resumePosition } from './playbackPosition'
import { previewKeyAt } from './previewKey'
import type { FramesLease } from './mouthFrameCache'
import { useScriptLines } from './useScriptLines'
import type { SpeakLine } from './useSpeakLine'

export type PlaybackMode = 'listen' | 'preview'

export interface Playing {
  lineId: string
  mode: PlaybackMode
  loading: boolean
}

/** 最後にプレビューした行。止めたあとでも、同じ内容のままならシークバーで絵を動かせる */
interface LastPreview {
  line: ScriptLine
  keys: FrameKey[]
}

/** 作り込みなどを変えたら、前のプレビューの絵や長さはもう使えない */
const sameLine = (a: ScriptLine, b: ScriptLine) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * 1行の試聴とプレビュー（口パク付き）。同時に鳴るのは1つだけで、次の再生で前のものを止める。
 * 画面が隠れたら（active が false）音を止める。
 */
export function useLinePlayback(active: boolean, speak: SpeakLine) {
  const { characters } = useApp()
  const { frameCache } = useScriptLines()
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [preview, setPreview] = useState<PreviewFrame | null>(null)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  // 表示中のプレビューの画像は、次のプレビューまで閉じさせない
  const previewLease = useRef<FramesLease | null>(null)
  // 再生位置は毎フレーム変わるので、状態ではなく入れ物に置く（読むのはシークバーだけ）
  const [position] = useState(createPositionStore)
  const [lastPreview, setLastPreview] = useState<LastPreview | null>(null)

  const stop = useCallback(() => {
    playbackRef.current?.cancel()
    playbackRef.current = null
    setPlaying(null)
  }, [])

  /** プレビューを空にする（別の行を開いたときなど） */
  const clearPreview = useCallback(() => {
    stop()
    previewLease.current?.release()
    previewLease.current = null
    setPreview(null)
    setLastPreview(null)
    position.set(null)
  }, [stop, position])

  // 別のタブへ移ったら音を止める（後始末と表示の更新は handle.done の側で行う）
  useEffect(() => {
    if (!active) playbackRef.current?.cancel()
  }, [active])

  useEffect(
    () => () => {
      playbackRef.current?.cancel()
      previewLease.current?.release()
    },
    [],
  )

  /** 鳴らせなかった理由は onError に渡す */
  /** プレビューを止めたあと、その行の位置を動かせるか（内容が変わっていないか） */
  const canSeek = (line: ScriptLine) => lastPreview !== null && sameLine(lastPreview.line, line)

  /** 再生中なら音ごと、止めているなら絵だけをその位置へ動かす（次の再生はそこから始まる） */
  const seek = (line: ScriptLine, time: number) => {
    const current = position.get()
    if (!current) return
    const to = Math.min(Math.max(time, 0), current.duration)
    if (playbackRef.current && playing?.lineId === line.id && !playing.loading) {
      playbackRef.current.seek(to)
      position.set({ time: to, duration: current.duration })
      return
    }
    if (!lastPreview || !sameLine(lastPreview.line, line)) return
    position.set({ time: to, duration: current.duration })
    const key = previewKeyAt(lastPreview.keys, to)
    setPreview((prev) => prev && { ...prev, key })
  }

  const play = (line: ScriptLine, lineNumber: number, mode: PlaybackMode, onError: (message: string) => void) => {
    // 同じ内容の行を続けて再生するときは、止めた位置から始める
    const startAt = mode === 'preview' && canSeek(line) ? resumePosition(position.get()) : 0
    stop()
    let ready
    try {
      ready = resolveLine(line, characters, mode === 'listen')
    } catch (e) {
      onError(errorMessage(e))
      return
    }
    const { character, expression } = ready

    let lease: FramesLease | null = null
    if (mode === 'preview') {
      // 先に次を借りてから前を返す（同じ絵なら閉じずに使い回される）
      lease = frameCache.acquire(character, expression)
      previewLease.current?.release()
      previewLease.current = lease
      // 止めた所から続けるときは、今の絵を出したままにする（合成は覚えてあるのですぐ鳴る）
      if (!canSeek(line)) {
        setPreview(null)
        position.set(null)
      }
    }
    const isCurrent = () => playbackRef.current === handle
    // 瞬きの位置は書き出しと同じ種（行の id）で決める。終端の長さは試聴・プレビューには足さない
    // 用意した各フレームの絵。load で埋めてから再生が始まるので、onMouth からは必ず埋まった後に読む
    let keys: FrameKey[] = []
    // 音声の長さ。再生が始まったときに分かる
    let duration = 0

    const handle = startSamplePlayback(
      async () => {
        const [prepared, sample] = await Promise.all([lease?.frames, speak(line, character.voice.styleId)])
        if (prepared && isCurrent()) {
          // 描画は同期で行うので、再生前に使う口と目の組み合わせを全部合成しておく
          const spec = prepared.frames.blink
          const blinkSeed = spec && { seed: line.id, hasHalf: spec.half !== null }
          keys = lineFrameKeys(frameSchedule(sample.timeline, FPS), blinkSeed)
          await prepared.frames.prepare(keys)
          if (isCurrent()) setPreview({ lineNumber, prepared, key: { vowel: 'closed', eye: 'open' } })
        }
        return sample
      },
      browserPlaybackEnv,
      {
        onPlaying: (length) => {
          if (!isCurrent()) return
          duration = length
          setPlaying({ lineId: line.id, mode, loading: false })
          if (mode === 'preview') setLastPreview({ line, keys })
        },
        onMouth: (_vowel, time) => {
          if (mode === 'preview' && isCurrent()) {
            position.set({ time: Math.min(time, duration), duration })
            const key = previewKeyAt(keys, time)
            setPreview((prev) =>
              prev && (prev.key.vowel !== key.vowel || prev.key.eye !== key.eye) ? { ...prev, key } : prev,
            )
          }
        },
      },
      { startAt },
    )
    playbackRef.current = handle
    setPlaying({ lineId: line.id, mode, loading: true })
    handle.done
      .then((result) => {
        // 最後まで再生したら、位置は終わりに置く（止めたときはその位置のまま）
        if (result === 'ended' && isCurrent() && mode === 'preview') position.set({ time: duration, duration })
        return result
      })
      .catch((e: unknown) => {
        if (isCurrent()) onError(errorMessage(e))
      })
      .finally(() => {
        if (!isCurrent()) return
        playbackRef.current = null
        setPlaying(null)
        // 止めたところの絵を残す。最後まで再生したら口を閉じた絵
        const at = position.get()
        setPreview(
          (prev) =>
            prev && {
              ...prev,
              key: at && at.time < at.duration ? previewKeyAt(keys, at.time) : { vowel: 'closed', eye: 'open' },
            },
        )
      })
  }

  return { playing, preview, play, stop, clearPreview, position, canSeek, seek }
}
