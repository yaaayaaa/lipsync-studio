import { useEffect, useMemo, useRef, useState } from 'react'
import type { LayerNode, VisibilityState } from '../../core/psd/types'
import type { PsdSize } from '../usePsd'
import { THUMB_PX, planThumb, requestThumb } from './layerThumbs'

interface Props {
  /** null なら空の枠（「未設定」など） */
  node: LayerNode | null
  /** グループの中身を決めるツリーの表示状態。リーフでは使わない */
  visibility: VisibilityState
  psdSize: PsdSize
}

/**
 * レイヤーの縮小画像。共有のキャッシュ（ImageBitmap）を自分の canvas に描き写すだけなので、
 * 同じレイヤーを何か所に出しても合成は1回で済む。透明部分は市松模様で見せる。
 */
export function LayerThumb({ node, visibility, psdSize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // グループの範囲と key を求めるのは描画リストを1回たどるだけなので毎回でよい
  const fresh = useMemo(() => (node ? planThumb(node, visibility) : null), [node, visibility])
  // 描く内容（key）が変わったときだけ作り直すため、key が同じ間は前の計画を使い続ける。
  // グループの外を切り替えても key は変わらず、リーフの key は不変
  const [shown, setShown] = useState({ node, plan: fresh })
  if (shown.node !== node || shown.plan?.key !== fresh?.key) setShown({ node, plan: fresh })
  // 画素を読んで全部透明と分かった計画。これと同じ間は空の枠を出す
  const [transparent, setTransparent] = useState<typeof shown | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!shown.node || !shown.plan || !canvas) return
    return requestThumb(shown.node, shown.plan, psdSize, (image) => {
      setTransparent(image ? null : shown)
      if (!image) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0)
    })
  }, [shown, psdSize])

  if (!fresh || transparent === shown) return <span className="layer-thumb empty" aria-hidden />
  return <canvas ref={canvasRef} className="layer-thumb" width={THUMB_PX} height={THUMB_PX} aria-hidden />
}
