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
import { FPS, frameSchedule, lineFrameKeys, placement } from './frames'
import type { FrameStore } from './frames'

/** VOICEVOX へ要求する出力サンプリングレート（Task 6 の prepareQuery と揃える）。 */
const AUDIO_SAMPLE_RATE = 48000

export interface EncodeSupport {
  ok: boolean
  reason?: string
}

export async function checkEncodeSupport(settings: ExportSettings): Promise<EncodeSupport> {
  const video = await canEncodeVideo('avc', { width: settings.width, height: settings.height })
  if (!video) return { ok: false, reason: 'この環境は H.264 での動画エンコードに対応していません' }
  const audio = await canEncodeAudio('aac', { numberOfChannels: 1, sampleRate: AUDIO_SAMPLE_RATE })
  if (!audio) return { ok: false, reason: 'この環境は AAC での音声エンコードに対応していません' }
  return { ok: true }
}

/** 1行分の素材。1本の mp4 に何行も続けて入れるときは、行ごとに1つ */
export interface LineSegment {
  wav: ArrayBuffer
  timeline: MouthTimeline
  frames: FrameStore
  psdSize: { width: number; height: number }
  /** 喋り終わったあと立ち絵を映し続ける秒数（音は入れない） */
  tailSeconds: number
  /** 瞬きの位置を決める種（行の ID）。同じ種なら同じ位置で瞬きする */
  blinkSeed: string
}

export interface RenderLineInput extends LineSegment {
  settings: ExportSettings
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

export interface RenderSegmentsInput {
  settings: ExportSettings
  /** 入れる行の数 */
  count: number
  /**
   * index 番目の行の素材を用意する。1行ずつ順に呼ぶので、合成や口の画像はその行の分だけ持てばよい。
   * release は、その行を書き終えたら（失敗しても）呼ぶ
   */
  load(index: number): Promise<{ segment: LineSegment; release?(): void }>
  /** 行を書き終えるたびと、各フレームで呼ぶ（index 番目の行の、その行の中での割合） */
  onProgress?: (index: number, ratio: number) => void
  signal?: AbortSignal
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('書き出しを中止しました', 'AbortError')
}

/** 1セリフ分の mp4（H.264 + AAC、30fps）を作る。 */
export async function renderLineMp4(input: RenderLineInput): Promise<Blob> {
  const { settings, onProgress, signal, ...segment } = input
  return renderSegmentsMp4({
    settings,
    count: 1,
    load: async () => ({ segment }),
    onProgress: onProgress && ((_, ratio) => onProgress(ratio)),
    signal,
  })
}

/** 1フレームの長さ（サンプル数）。48000 / 30 で割り切れるので、行のつなぎ目で音と映像がずれない */
const SAMPLES_PER_FRAME = AUDIO_SAMPLE_RATE / FPS

/**
 * 何行かを続けて1本の mp4（H.264 + AAC、30fps）にする。行は前の行の映像の終わり（終端を含む）から始める。
 * 音声はその行の映像の長さまで無音で埋めてから次の行を足す（最後の行だけは埋めない：終端には音を入れない）
 */
export async function renderSegmentsMp4(input: RenderSegmentsInput): Promise<Blob> {
  const { settings, count, load, onProgress, signal } = input
  if (settings.width % 2 !== 0 || settings.height % 2 !== 0) {
    throw new Error(`H.264 の解像度は偶数でなければなりません: ${settings.width}x${settings.height}`)
  }
  if (count < 1) throw new Error('書き出す行がありません')
  throwIfAborted(signal)

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
    let started = false
    // 書き終えたフレームの数（次の行はここから始める）
    let frameOffset = 0

    for (let index = 0; index < count; index++) {
      throwIfAborted(signal)
      const { segment, release } = await load(index)
      try {
        const { wav, timeline, frames, psdSize, tailSeconds, blinkSeed } = segment
        // decodeAudioData は渡した ArrayBuffer を detach するので、呼び出し側の wav は複製を渡す
        const audio = await new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE).decodeAudioData(wav.slice(0))
        // WAV がタイムラインより長くても、映像が音声の最後まで続くようにする。終端の分はそのあとに足す
        const vowels = frameSchedule(timeline, FPS, audio.duration, tailSeconds)
        const blink = frames.blink && { seed: blinkSeed, hasHalf: frames.blink.half !== null }
        const schedule = lineFrameKeys(vowels, blink)
        await frames.prepare(schedule)
        throwIfAborted(signal)
        const rect = placement(settings, psdSize)

        // 最初の行の素材がそろってから始める（合成に失敗したら、空の出力を作らずに済む）
        if (!started) {
          await output.start()
          started = true
        }
        // 音声は先に行の全量を渡す。映像は音声の長さ以上になる（端数は最後のフレームの分と終端の分だけ長い）
        const last = index === count - 1
        await audioSource.add(last ? audio : padTo(audio, schedule.length * SAMPLES_PER_FRAME))

        for (let i = 0; i < schedule.length; i++) {
          throwIfAborted(signal)
          const mouth = frames.get(schedule[i]!)
          ctx.fillStyle = settings.background
          ctx.fillRect(0, 0, settings.width, settings.height)
          ctx.drawImage(mouth, rect.x, rect.y, rect.width, rect.height)
          await videoSource.add((frameOffset + i) / FPS, 1 / FPS)
          onProgress?.(index, (i + 1) / schedule.length)
        }
        frameOffset += schedule.length
      } finally {
        release?.()
      }
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

/** 音声の後ろを無音で埋めて length サンプルにする。もう長ければそのまま（映像は音声より短くならない） */
function padTo(audio: AudioBuffer, length: number): AudioBuffer {
  if (audio.length >= length) return audio
  const padded = new AudioBuffer({ numberOfChannels: 1, length, sampleRate: audio.sampleRate })
  padded.copyToChannel(audio.getChannelData(0), 0)
  return padded
}
