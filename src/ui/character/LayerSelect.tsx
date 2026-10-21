import type { LayerId, VisibilityState } from '../../core/psd/types'
import type { PsdSize } from '../usePsd'
import { Dropdown } from '../Dropdown'
import { LayerThumb } from './LayerThumb'
import type { LayerOption } from './groupOptions'

interface Props {
  /** ボタンの読み上げ名（例「あの口」「口グループ」） */
  label: string
  /** 選択肢（上から順）。先頭に「未設定」が付く */
  options: LayerOption[]
  value: LayerId | null
  /** 開いているか。同時に1つだけ開くよう親が持つ */
  open: boolean
  onOpenChange(open: boolean): void
  onChange(layerId: LayerId | null): void
  /** 開いている間に強調中の選択肢が変わるたびに呼ぶ（null は「未設定」）。閉じたら undefined */
  onActiveChange?(layerId: LayerId | null | undefined): void
  visibility: VisibilityState
  psdSize: PsdSize
}

/** レイヤーを選ぶ縮小画像付きのドロップダウン。口グループと母音の口、目で使う */
export function LayerSelect({ options, visibility, psdSize, ...rest }: Props) {
  const thumb = (node: LayerOption['node'] | null) => (
    <LayerThumb node={node} visibility={visibility} psdSize={psdSize} />
  )
  return (
    <Dropdown
      {...rest}
      className="layer-select"
      items={[
        { value: null, label: '未設定', leading: thumb(null) },
        ...options.map((o) => ({ value: o.node.id, label: o.label, leading: thumb(o.node) })),
      ]}
    />
  )
}
