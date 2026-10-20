import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScriptLine } from '../../core/character/types'
import { FPS, frameSchedule, lineFrameKeys } from '../../core/export/frames'
import { blinkStarts, eyeAtFrame } from '../../core/lipsync/blink'
import { browserPlaybackEnv, startSamplePlayback } from '../character/samplePlayback'
import type { PlaybackHandle } from '../character/samplePlayback'
import { useApp } from '../useApp'
import type { PreviewFrame } from './LinePreview'
import { errorMessage, resolveLine } from './lineJobs'
import type { FramesLease } from './mouthFrameCache'
import { useScriptLines } from './useScriptLines'
import type { SpeakLine } from './useSpeakLine'

export type PlaybackMode = 'listen' | 'preview'

export interface Playing {
  lineId: string
  mode: PlaybackMode
  loading: boolean
}

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
  }, [stop])

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
  const play = (line: ScriptLine, lineNumber: number, mode: PlaybackMode, onError: (message: string) => void) => {
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
      previewLease.current?.release()
      lease = frameCache.acquire(character, expression)
      previewLease.current = lease
      setPreview(null)
    }
    const isCurrent = () => playbackRef.current === handle
    // 瞬きの位置は書き出しと同じ種（行の id）で決める。終端の長さは試聴・プレビューには足さない
    let blink: { starts: number[]; hasHalf: boolean; frameCount: number } | null = null

    const handle = startSamplePlayback(
      async () => {
        const [prepared, sample] = await Promise.all([lease?.frames, speak(line, character.voice.styleId)])
        if (prepared && isCurrent()) {
          // 描画は同期で行うので、再生前に使う口と目の組み合わせを全部合成しておく
          const vowels = frameSchedule(sample.timeline, FPS)
          const spec = prepared.frames.blink
          await prepared.frames.prepare(lineFrameKeys(vowels, spec && { seed: line.id, hasHalf: spec.half !== null }))
          if (spec) {
            blink = {
              starts: blinkStarts(line.id, vowels.length),
              hasHalf: spec.half !== null,
              frameCount: vowels.length,
            }
          }
          if (isCurrent()) setPreview({ lineNumber, prepared, key: { vowel: 'closed', eye: 'open' } })
        }
        return sample
      },
      browserPlaybackEnv,
      {
        onPlaying: () => isCurrent() && setPlaying({ lineId: line.id, mode, loading: false }),
        onMouth: (vowel, time) => {
          if (mode === 'preview' && isCurrent()) {
            // 音声が口の予定より少し長いこともあるので、最後のフレームの目に留める
            const frame = Math.min(Math.floor(time * FPS), (blink?.frameCount ?? 1) - 1)
            const eye = blink ? eyeAtFrame(blink.starts, frame, blink.hasHalf) : 'open'
            setPreview((prev) =>
              prev && (prev.key.vowel !== vowel || prev.key.eye !== eye) ? { ...prev, key: { vowel, eye } } : prev,
            )
          }
        },
      },
    )
    playbackRef.current = handle
    setPlaying({ lineId: line.id, mode, loading: true })
    handle.done
      .catch((e: unknown) => {
        if (isCurrent()) onError(errorMessage(e))
      })
      .finally(() => {
        if (!isCurrent()) return
        playbackRef.current = null
        setPlaying(null)
        setPreview((prev) => prev && { ...prev, key: { vowel: 'closed', eye: 'open' } })
      })
  }

  return { playing, preview, play, stop, clearPreview }
}
