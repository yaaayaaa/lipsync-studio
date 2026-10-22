// 書き出しの解像度。よく使う大きさは候補から選び、それ以外は幅と高さを数字で入れる。

export interface Resolution {
  width: number
  height: number
}

export const RESOLUTION_PRESETS: readonly (Resolution & { label: string })[] = [
  { width: 1920, height: 1080, label: '1920×1080' },
  { width: 1280, height: 720, label: '1280×720' },
  { width: 1080, height: 1920, label: '1080×1920（縦）' },
  { width: 1080, height: 1080, label: '1080×1080（正方形）' },
]

/** 入れられる幅・高さの範囲。上は 4K の横幅まで（大きすぎるとブラウザのエンコーダーが受け付けない） */
export const RESOLUTION_RANGE = { min: 16, max: 3840 } as const

export function presetOf(r: Resolution) {
  return RESOLUTION_PRESETS.find((p) => p.width === r.width && p.height === r.height) ?? null
}

/**
 * 幅と高さの入力を確かめる。H.264 は奇数の大きさを扱えないので偶数に限る。
 * 前後の空白は無視し、全角数字も受け付ける
 */
export function parseResolution(widthText: string, heightText: string): Resolution | { error: string } {
  const width = parseSide(widthText)
  const height = parseSide(heightText)
  const problem = sideProblem('幅', width) ?? sideProblem('高さ', height)
  return problem ? { error: problem } : { width: width!, height: height! }
}

function parseSide(text: string): number | null {
  const ascii = text.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  return /^\d+$/.test(ascii) ? Number(ascii) : null
}

function sideProblem(name: string, value: number | null): string | null {
  const { min, max } = RESOLUTION_RANGE
  if (value === null) return `${name}は数字で入力してください`
  if (value < min || value > max) return `${name}は ${min}〜${max} にしてください`
  if (value % 2 !== 0) return `${name}は偶数にしてください（H.264 の決まり）`
  return null
}
