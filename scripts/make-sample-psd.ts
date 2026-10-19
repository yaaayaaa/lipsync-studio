// UI 確認用のサンプル PSD を samples/sample.psd に書き出す（samples/ は git 管理外）。
// 使い方: npx tsx scripts/make-sample-psd.ts
// 立ち絵素材をリポジトリに入れない方針なので、図形だけの PSD をプログラムで作る。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writePsdBuffer } from 'ag-psd'
import type { Layer, PixelData } from 'ag-psd'

const WIDTH = 400
const HEIGHT = 800
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../samples/sample.psd')

type Rgba = [number, number, number, number]
type Shape = (x: number, y: number) => boolean

function pixels(shape: Shape, color: Rgba): PixelData {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (!shape(x, y)) continue
      data.set(color, (y * WIDTH + x) * 4)
    }
  }
  return { data, width: WIDTH, height: HEIGHT }
}

const ellipse =
  (cx: number, cy: number, rx: number, ry: number): Shape =>
  (x, y) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
const rect =
  (x0: number, y0: number, x1: number, y1: number): Shape =>
  (x, y) =>
    x >= x0 && x < x1 && y >= y0 && y < y1
const union =
  (...shapes: Shape[]): Shape =>
  (x, y) =>
    shapes.some((s) => s(x, y))

function image(name: string, shape: Shape, color: Rgba, hidden = false): Layer {
  return { name, hidden, top: 0, left: 0, bottom: HEIGHT, right: WIDTH, imageData: pixels(shape, color) }
}

const layers: Layer[] = [
  image('!体', union(ellipse(200, 200, 110, 120), rect(110, 320, 290, 760)), [250, 225, 200, 255]),
  {
    name: '目',
    children: [
      image('*普通目', union(ellipse(160, 190, 14, 22), ellipse(240, 190, 14, 22)), [40, 40, 60, 255]),
      image('*にっこり', union(rect(140, 188, 180, 196), rect(220, 188, 260, 196)), [40, 40, 60, 255], true),
    ],
  },
  {
    name: '口',
    children: [
      image('*むふ', rect(180, 258, 220, 264), [150, 40, 40, 255]),
      image('*ほあー', ellipse(200, 262, 26, 18), [200, 40, 60, 255], true),
      image('*んあー', ellipse(200, 262, 30, 10), [220, 120, 40, 255], true),
      image('*お', ellipse(200, 262, 12, 16), [60, 60, 200, 255], true),
    ],
  },
  image('髪:flipx', rect(90, 70, 310, 110), [60, 160, 60, 255]),
]

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, writePsdBuffer({ width: WIDTH, height: HEIGHT, children: layers }, { generateThumbnail: false }))
console.log(`wrote ${OUT}`)
