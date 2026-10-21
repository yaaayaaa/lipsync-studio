import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
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
  /** まだ何も再生していないときの案内（controls があるときは出さない） */
  idleHint?: string
  /** 映像のすぐ下の真ん中に置く再生の操作（動画編集ソフトのプレビューと同じ並び）。なければ案内の一言だけ */
  controls?: ReactNode
  /** 声を作っている間。映像を暗くして、真ん中で輪を回す */
  busy?: boolean
}

/** 書き出しと同じ解像度・配置・背景で、その時点の口を描く。 */
export function LinePreview({
  frame,
  settings,
  caption,
  idleHint = '行の「プレビュー」を押すと、口パクを音声付きで再生します',
  controls,
  busy = false,
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
    <section className="panel line-preview">
      <h2>プレビュー</h2>
      {/* 置き場所の大きさに合わせて縮むときに使う、動画の縦横比 */}
      <div
        className="line-preview-stage"
        style={{ '--preview-aspect': settings.width / settings.height } as CSSProperties}
      >
        <div className="line-preview-frame">
          <canvas
            ref={canvasRef}
            className="line-preview-canvas"
            width={settings.width}
            height={settings.height}
            aria-label="セリフのプレビュー"
          />
          {busy && (
            <div className="preview-busy" role="status">
              <span className="preview-busy-ring" aria-hidden />
              <span className="preview-busy-label">合成中…</span>
            </div>
          )}
        </div>
      </div>
      {controls ? (
        <div className="preview-transport">
          {/* 再生ボタンが見えているので、まだ再生していないときの案内は出さない */}
          <p className="hint">{caption ?? (frame ? `${frame.lineNumber}行目` : null)}</p>
          <div className="preview-transport-controls">{controls}</div>
        </div>
      ) : (
        <p className="hint">{caption ?? (frame ? `${frame.lineNumber}行目` : idleHint)}</p>
      )}
    </section>
  )
}
