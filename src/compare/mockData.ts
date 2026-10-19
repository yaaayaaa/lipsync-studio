import type { LayerOption, MenuItemSpec } from './contract'

function svgThumb(shape: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${shape}</svg>`)}`
}

export const MOUTH_OPTIONS: LayerOption[] = [
  { id: null, name: '未設定', thumb: null },
  { id: 'o', name: 'お', thumb: svgThumb('<ellipse cx="20" cy="20" rx="9" ry="13" fill="#3b3bd0"/>') },
  { id: 'nn', name: 'んあー', thumb: svgThumb('<ellipse cx="20" cy="20" rx="15" ry="6" fill="#e07a20"/>') },
  { id: 'hoa', name: 'ほあー', thumb: svgThumb('<ellipse cx="20" cy="20" rx="14" ry="10" fill="#d02040"/>') },
  { id: 'muf', name: 'むふ', thumb: svgThumb('<rect x="6" y="18" width="28" height="4" fill="#902020"/>') },
  // 長い一覧でのスクロールを見るための候補
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `extra${i}`,
    name: `口パーツ${i + 1}`,
    thumb: svgThumb(`<circle cx="20" cy="20" r="${6 + i}" fill="#555"/>`),
  })),
]

export const CHARACTER_MENU: MenuItemSpec[] = [
  { id: 'rename', label: '名前を変更' },
  { id: 'delete', label: '削除', danger: true },
]

export const EXPRESSION_MENU: MenuItemSpec[] = [
  { id: 'overwrite', label: '現在の状態で上書き' },
  { id: 'rename', label: '名前を変更' },
  { id: 'delete', label: '削除', danger: true },
]
