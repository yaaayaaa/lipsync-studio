import { useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { PositionStore } from './playbackPosition'

interface Props {
  store: PositionStore
  /** 動かせるとき（再生中か、止めた行の内容が変わっていないとき）。それ以外は線だけを見せる */
  enabled: boolean
  onSeek(time: number): void
}

/** 映像の最下部に重ねるシークバー。丸（つまみ）はプレビューにカーソルを合わせたときだけ出す（app.css） */
export function SeekBar({ store, enabled, onSeek }: Props) {
  const position = useSyncExternalStore(store.subscribe, store.get)
  const duration = position?.duration ?? 0
  const time = position?.time ?? 0
  const progress = duration > 0 ? Math.min(time / duration, 1) : 0
  return (
    <input
      type="range"
      className="seek-bar"
      min={0}
      max={duration || 1}
      step={0.01}
      value={time}
      disabled={!enabled || duration === 0}
      aria-label="再生位置"
      aria-valuetext={`${time.toFixed(2)} 秒 / ${duration.toFixed(2)} 秒`}
      style={{ '--seek-ratio': progress } as CSSProperties}
      onChange={(e) => onSeek(Number(e.target.value))}
    />
  )
}
