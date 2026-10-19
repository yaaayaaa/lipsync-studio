// 今のアプリの自作部品（RowMenu / LayerSelect）を比較用の共通の形に合わせる薄い包み。
// アプリ側の部品は変更しない。LayerSelect は PSD のレイヤー（LayerNode）を受け取るので、
// 比較用のサムネイル（SVG の data URL）を canvas に描いた見せかけのレイヤーに直して渡す。
import { useEffect, useState } from 'react'
import type { Layer } from 'ag-psd'
import { RowMenu } from '../../ui/character/RowMenu'
import { LayerSelect } from '../../ui/character/LayerSelect'
import type { LayerOption as AppLayerOption } from '../../ui/character/LayerSelect'
import type { LayerNode } from '../../core/psd/types'
import type { Impl, LayerOption, LayerSelectDemoProps, RowMenuDemoProps } from '../contract'

const THUMB_SIZE = 96
const PSD_SIZE = { width: THUMB_SIZE, height: THUMB_SIZE }
const NO_VISIBILITY = {}

function RowMenuDemo({ label, items, onSelect }: RowMenuDemoProps) {
  return (
    <RowMenu
      label={label}
      items={items.map((item) => ({ label: item.label, danger: item.danger, onSelect: () => onSelect(item.id) }))}
    />
  )
}

/** サムネイル画像を canvas に描いておく。layerThumbs は1回だけ画素を走査して覚えるので、読み込み後に渡す必要がある */
const canvasCache = new Map<string, Promise<HTMLCanvasElement>>()
function loadCanvas(src: string): Promise<HTMLCanvasElement> {
  let cached = canvasCache.get(src)
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = THUMB_SIZE
        canvas.height = THUMB_SIZE
        canvas.getContext('2d')?.drawImage(img, 0, 0, THUMB_SIZE, THUMB_SIZE)
        resolve(canvas)
      }
      img.onerror = () => reject(new Error(`thumbnail failed to load: ${src.slice(0, 40)}`))
      img.src = src
    })
    canvasCache.set(src, cached)
  }
  return cached
}

function fakeNode(id: string, name: string, canvas: HTMLCanvasElement | undefined): LayerNode {
  return {
    id,
    name,
    rawName: name,
    kind: 'normal',
    isGroup: false,
    flip: false,
    initiallyVisible: true,
    children: [],
    source: { canvas, left: 0, top: 0 } as Layer,
  }
}

function useAppOptions(options: LayerOption[]): AppLayerOption[] | null {
  const [result, setResult] = useState<{ from: LayerOption[]; options: AppLayerOption[] } | null>(null)
  useEffect(() => {
    let alive = true
    // 「未設定」は LayerSelect が自分で先頭に付けるので除く
    const real = options.filter((o): o is LayerOption & { id: string } => o.id !== null)
    Promise.all(real.map((o) => (o.thumb ? loadCanvas(o.thumb) : Promise.resolve(undefined)))).then(
      (canvases) => {
        if (alive) setResult({ from: options, options: real.map((o, i) => ({ node: fakeNode(o.id, o.name, canvases[i]), label: o.name })) })
      },
      (e: unknown) => console.error(e),
    )
    return () => {
      alive = false
    }
  }, [options])
  return result?.from === options ? result.options : null
}

function LayerSelectDemo({ label, options, value, onChange, onActiveChange }: LayerSelectDemoProps) {
  // アプリでは「同時に1つだけ開く」よう親が開閉を持つ。ここでは部品ごとに持つ（外側の押下で閉じるので結果は同じ）
  const [open, setOpen] = useState(false)
  const appOptions = useAppOptions(options)
  if (!appOptions) return <div className="layer-select">読み込み中…</div>
  return (
    <LayerSelect
      label={label}
      options={appOptions}
      value={value}
      open={open}
      onOpenChange={setOpen}
      onChange={onChange}
      onActiveChange={onActiveChange}
      visibility={NO_VISIBILITY}
      psdSize={PSD_SIZE}
    />
  )
}

export const impl: Impl = {
  key: 'current',
  name: '現在の自作',
  packages: '自作（ライブラリなし）',
  RowMenuDemo,
  LayerSelectDemo,
  notes: [
    'アプリの RowMenu / LayerSelect をそのまま使用（比較用の包みはサムネイルを見せかけのレイヤーに直すだけ）。',
    '非モーダル：外側の押下で閉じるだけなので、ページはスクロールでき、別のプルダウンも1クリックで開く。',
    '開閉・キー操作は純粋関数（menu.ts / dropdown.ts）でテスト済み。メニューは端で循環、プルダウンは端で止まる。先頭文字ジャンプは無い。',
    '配置は自前の placePopover（下に入らなければ上、横は画面内）。ボタンが画面外に出たら閉じる。Safari のフォーカス癖への対策も自前。',
  ],
}
