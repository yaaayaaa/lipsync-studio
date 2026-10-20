import { useEffect, useRef } from 'react'
import type { ExportSettings } from '../../core/character/types'
import type { FrameKey } from '../../core/export/frames'
import type { PreparedFrames } from './mouthFrameCache'
import { drawMouthFrame } from './lineJobs'

export interface PreviewFrame {
  lineNumber: number
  prepared: PreparedFrames
  key: FrameKey
}

interface Props {
  frame: PreviewFrame | null
  settings: ExportSettings
  /** 合成中・再生中などの一言 */
  caption: string | null
  /** まだ何も再生していないときの案内 */
  idleHint?: string
}

/** 書き出しと同じ解像度・配置・背景で、その時点の口を描く。 */
export function LinePreview({
  frame,
  settings,
  caption,
  idleHint = '行の「プレビュー」を押すと、口パクを音声付きで再生します',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    if (frame) {
      drawMouthFrame(ctx, frame.prepared.frames, frame.key, frame.prepared.psdSize, settings)
    } else {
      ctx.fillStyle = settings.background
      ctx.fillRect(0, 0, settings.width, settings.height)
    }
  }, [frame, settings])

  return (
    <section className="panel">
      <h2>プレビュー</h2>
      <canvas
        ref={canvasRef}
        className="line-preview-canvas"
        width={settings.width}
        height={settings.height}
        aria-label="セリフのプレビュー"
      />
      <p className="hint">
        {caption ?? (frame ? `${frame.lineNumber}行目` : idleHint)}
      </p>
    </section>
  )
}
