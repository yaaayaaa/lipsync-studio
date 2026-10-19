import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny'
import type { ExportSettings } from '../character/types'
import type { MouthTimeline } from '../lipsync/timeline'
import { FPS, frameSchedule, placement } from './frames'
import type { MouthFrames } from './frames'

/** VOICEVOX へ要求する出力サンプリングレート（Task 6 の prepareQuery と揃える）。 */
const AUDIO_SAMPLE_RATE = 48000

export interface EncodeSupport {
  ok: boolean
  reason?: string
}

export async function checkEncodeSupport(settings: ExportSettings): Promise<EncodeSupport> {
  const video = await canEncodeVideo('avc', { width: settings.width, height: settings.height })
  if (!video) return { ok: false, reason: 'このブラウザは H.264 での動画エンコードに対応していません' }
  const audio = await canEncodeAudio('aac', { numberOfChannels: 1, sampleRate: AUDIO_SAMPLE_RATE })
  if (!audio) return { ok: false, reason: 'このブラウザは AAC での音声エンコードに対応していません' }
  return { ok: true }
}

export interface RenderLineInput {
  wav: ArrayBuffer
  timeline: MouthTimeline
  frames: MouthFrames
  psdSize: { width: number; height: number }
  settings: ExportSettings
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('書き出しを中止しました', 'AbortError')
}

/** 1セリフ分の mp4（H.264 + AAC、30fps）を作る。 */
export async function renderLineMp4(input: RenderLineInput): Promise<Blob> {
  const { wav, timeline, frames, psdSize, settings, onProgress, signal } = input
  if (settings.width % 2 !== 0 || settings.height % 2 !== 0) {
    throw new Error(`H.264 の解像度は偶数でなければなりません: ${settings.width}x${settings.height}`)
  }
  throwIfAborted(signal)

  // decodeAudioData は渡した ArrayBuffer を detach するので、呼び出し側の wav は複製を渡す
  const audio = await new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE).decodeAudioData(wav.slice(0))
  // WAV がタイムラインより長くても、映像が音声の最後まで続くようにする
  const schedule = frameSchedule(timeline, FPS, audio.duration)
  const rect = placement(settings, psdSize)

  const canvas = new OffscreenCanvas(settings.width, settings.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context を作れませんでした')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  try {
    const videoSource = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH })
    const audioSource = new AudioBufferSource({ codec: 'aac', quality: QUALITY_HIGH })
    output.addVideoTrack(videoSource, { frameRate: FPS })
    output.addAudioTrack(audioSource)
    await output.start()

    // 音声は先に全量を渡す。映像は音声の長さ以上になる（端数は最後のフレームの分だけ長い）
    await audioSource.add(audio)

    for (let i = 0; i < schedule.length; i++) {
      throwIfAborted(signal)
      const mouth = frames.get(schedule[i]!)
      if (!mouth) throw new Error(`口「${schedule[i]}」の画像がありません`)
      ctx.fillStyle = settings.background
      ctx.fillRect(0, 0, settings.width, settings.height)
      ctx.drawImage(mouth, rect.x, rect.y, rect.width, rect.height)
      await videoSource.add(i / FPS, 1 / FPS)
      onProgress?.((i + 1) / schedule.length)
    }

    throwIfAborted(signal)
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => {})
    throw e
  }
  if (!target.buffer) throw new Error('mp4 の出力が空でした')
  return new Blob([target.buffer], { type: 'video/mp4' })
}
