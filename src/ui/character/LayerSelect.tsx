import { useEffect, useRef } from 'react'
import * as Select from '@radix-ui/react-select'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { iconProps } from '../icons'
import type { LayerId, LayerNode, VisibilityState } from '../../core/psd/types'
import type { PsdSize } from '../usePsd'
import { LayerThumb } from './LayerThumb'

export interface LayerOption {
  node: LayerNode
  /** 表示名（グループならパス付きなど） */
  label: string
}

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

/** Radix Select は空文字の値を持てないので「未設定」をこの値で表す */
const NONE = '__none__'

/**
 * レイヤーを選ぶ縮小画像付きのドロップダウン（Radix Select、popper 配置）。口グループと母音の口で使う。
 * 強調中の選択肢は、Radix がマウスやキーで項目へフォーカスを移すので、その onFocus で拾う。
 */
export function LayerSelect({
  label,
  options,
  value,
  open,
  onOpenChange,
  onChange,
  onActiveChange,
  visibility,
  psdSize,
}: Props) {
  const items: { id: LayerId | null; name: string; node: LayerNode | null }[] = [
    { id: null, name: '未設定', node: null },
    ...options.map((o) => ({ id: o.node.id, name: o.label, node: o.node })),
  ]
  const current = items.find((it) => it.id === value) ?? null

  // 試し見せの知らせ。閉じたら undefined、消えたときも残さない
  const onActiveChangeRef = useRef(onActiveChange)
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange
  })
  useEffect(() => {
    if (!open) onActiveChangeRef.current?.(undefined)
  }, [open])
  useEffect(() => () => onActiveChangeRef.current?.(undefined), [])

  return (
    <div className="layer-select">
      <Select.Root
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
        open={open}
        onOpenChange={onOpenChange}
      >
        <Select.Trigger className="layer-select-button" aria-label={`${label}: ${current?.name ?? '未設定'}`}>
          <LayerThumb node={current?.node ?? null} visibility={visibility} psdSize={psdSize} />
          <span className="layer-select-name">
            <Select.Value>{current?.name ?? '未設定'}</Select.Value>
          </span>
          <Select.Icon asChild>
            <ChevronDown className="layer-select-caret" {...iconProps} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="layer-select-list"
            aria-label={label}
            position="popper"
            side="bottom"
            align="start"
            sideOffset={2}
            collisionPadding={8}
          >
            <Select.ScrollUpButton className="layer-select-scroll">
              <ChevronUp {...iconProps} />
            </Select.ScrollUpButton>
            <Select.Viewport>
              {items.map((it) => (
                <Select.Item
                  key={it.id ?? NONE}
                  value={it.id ?? NONE}
                  textValue={it.name}
                  className="layer-select-option"
                  onFocus={() => onActiveChangeRef.current?.(it.id)}
                >
                  <LayerThumb node={it.node} visibility={visibility} psdSize={psdSize} />
                  <span className="layer-select-name">
                    <Select.ItemText>{it.name}</Select.ItemText>
                  </span>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="layer-select-scroll">
              <ChevronDown {...iconProps} />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}
