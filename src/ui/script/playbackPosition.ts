/** 再生位置と長さ（秒） */
export interface PlaybackPosition {
  time: number
  duration: number
}

/**
 * 再生位置の入れ物。再生中は毎フレーム変わるので React の状態には置かず、
 * 見せる部品（シークバー）だけが useSyncExternalStore で読む。画面全体を毎フレーム描き直さないため
 */
export interface PositionStore {
  get(): PlaybackPosition | null
  set(position: PlaybackPosition | null): void
  subscribe(listener: () => void): () => void
}

export function createPositionStore(): PositionStore {
  let value: PlaybackPosition | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(position) {
      if (position === value) return
      if (position && value && position.time === value.time && position.duration === value.duration) return
      value = position
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** 止めた位置から続けるときの開始位置。最後まで（終わりの 0.05 秒以内まで）再生していたら頭から */
export function resumePosition(position: PlaybackPosition | null): number {
  if (!position || position.time >= position.duration - 0.05) return 0
  return Math.max(position.time, 0)
}
