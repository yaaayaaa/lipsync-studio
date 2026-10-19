import type { Character, Expression } from '../../core/character/types'
import type { MouthFrames } from '../../core/export/frames'

export interface PreparedFrames {
  frames: MouthFrames
  psdSize: { width: number; height: number }
}

export type RenderFrames = (character: Character, expression: Expression) => Promise<PreparedFrames>

export interface FramesLease {
  frames: Promise<PreparedFrames>
  /** 使い終わったら必ず呼ぶ。追い出し済みの画像は、使っている人がいなくなった時点で閉じる */
  release(): void
}

interface Entry {
  version: string
  frames: Promise<PreparedFrames>
  users: number
  retired: boolean
}

/** 口の画像を左右するものだけで版を作る。どれかが変われば作り直す。 */
function versionOf(character: Character, expression: Expression): string {
  return JSON.stringify([character.mouthGroupId, character.mouthMap, expression.visibility])
}

function closeFrames(entry: Entry): void {
  entry.frames.then(
    ({ frames }) => frames.forEach((bitmap) => bitmap.close()),
    () => {},
  )
}

/**
 * (キャラ, スタイル) ごとに口の種類ぶんの画像を1回だけ合成して使い回す。
 * 1組で PSD サイズの画像が6枚あるので、持つ組数に上限を設け、古いものから閉じる。
 */
export class MouthFrameCache {
  private readonly entries = new Map<string, Entry>()
  private readonly render: RenderFrames
  private readonly limit: number

  constructor(render: RenderFrames, limit = 4) {
    this.render = render
    this.limit = limit
  }

  acquire(character: Character, expression: Expression): FramesLease {
    const key = `${character.id}:${expression.id}`
    const version = versionOf(character, expression)
    let entry = this.entries.get(key)
    if (entry && entry.version !== version) {
      this.retire(key, entry)
      entry = undefined
    }
    if (entry) {
      // 最近使ったものを末尾へ（Map の挿入順を LRU として使う）
      this.entries.delete(key)
      this.entries.set(key, entry)
    } else {
      const created: Entry = { version, frames: this.render(character, expression), users: 0, retired: false }
      // 失敗は覚えておかない（次に使うときに作り直す）
      created.frames.catch(() => {
        if (this.entries.get(key) === created) this.entries.delete(key)
      })
      entry = created
      this.entries.set(key, entry)
      this.evictOverLimit()
    }

    const leased = entry
    leased.users++
    let released = false
    return {
      frames: leased.frames,
      release: () => {
        if (released) return
        released = true
        leased.users--
        if (leased.retired && leased.users === 0) closeFrames(leased)
      },
    }
  }

  /** 画面を離れるときに呼ぶ。使用中のものは返却時に閉じる */
  dispose(): void {
    for (const [key, entry] of [...this.entries]) this.retire(key, entry)
  }

  private evictOverLimit(): void {
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.limit) break
      this.retire(key, entry)
    }
  }

  private retire(key: string, entry: Entry): void {
    this.entries.delete(key)
    entry.retired = true
    if (entry.users === 0) closeFrames(entry)
  }
}
