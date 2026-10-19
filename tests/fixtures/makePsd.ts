import type { Layer } from 'ag-psd'

export interface LayerOpts {
  hidden?: boolean
  children?: Layer[]
  /** true なら 1x1 のスタブ canvas を付ける（画像ありのリーフを表す） */
  image?: boolean
}

/** テスト用の ag-psd Layer を作る。children を渡すとグループになる。 */
export function layer(name: string, opts: LayerOpts = {}): Layer {
  const l: Layer = { name }
  if (opts.hidden) l.hidden = true
  if (opts.children) l.children = opts.children
  if (opts.image) l.canvas = { width: 1, height: 1 } as unknown as NonNullable<Layer['canvas']>
  return l
}
