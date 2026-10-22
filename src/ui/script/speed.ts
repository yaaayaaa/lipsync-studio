// 話速の置き場は ScriptLine.speedScale だけ。台本の「その他」の話速はこの範囲を使う。
export const SPEED_MIN = 0.5
export const SPEED_MAX = 2.0
export const SPEED_STEP = 0.05

/** 範囲外は端に寄せ、数でなければ既定の 1.0 にする */
export function clampSpeed(v: number): number {
  return Number.isFinite(v) ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) : 1
}
