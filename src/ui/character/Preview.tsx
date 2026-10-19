import { useEffect, useRef } from 'react'
import { composeTo } from '../../core/psd/compose'
import type { LayerNode, VisibilityState } from '../../core/psd/types'
import type { PsdSize } from '../usePsd'

interface Props {
  tree: LayerNode[]
  /** 口の差し替えを済ませた表示状態 */
  visibility: VisibilityState
  psdSize: PsdSize
}

export function Preview({ tree, visibility, psdSize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    composeTo(ctx, tree, visibility, psdSize)
  }, [tree, visibility, psdSize])

  return (
    <canvas
      ref={canvasRef}
      className="preview-canvas"
      width={psdSize.width}
      height={psdSize.height}
      aria-label="立ち絵のプレビュー"
    />
  )
}
