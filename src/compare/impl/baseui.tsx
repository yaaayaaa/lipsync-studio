import { useEffect, useRef } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Select } from '@base-ui/react/select'
import { ChevronDown, EllipsisVertical } from 'lucide-react'
import type { Impl, LayerOption, LayerSelectDemoProps, RowMenuDemoProps } from '../contract'
import './baseui.css'

function RowMenuDemo({ label, items, onSelect }: RowMenuDemoProps) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className="cmp-baseui-menu-trigger" aria-label={label}>
        <EllipsisVertical size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="cmp-baseui-positioner" side="bottom" align="end" sideOffset={2}>
          <Menu.Popup className="cmp-baseui-popup">
            {items.map((item) => (
              <Menu.Item
                key={item.id}
                className="cmp-baseui-menu-item"
                data-danger={item.danger ? '' : undefined}
                onClick={() => onSelect(item.id)}
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

// Select は null を「未選択」に使うので、「未設定」項目は番兵の文字列で表す
const NONE = '__none__'
const toKey = (id: string | null) => id ?? NONE
const fromKey = (key: string) => (key === NONE ? null : key)

function Thumb({ option, size }: { option: LayerOption | undefined; size: 'sm' | 'lg' }) {
  const cls = `cmp-baseui-thumb cmp-baseui-thumb-${size}`
  return option?.thumb ? (
    <span className={cls}>
      <img src={option.thumb} alt="" />
    </span>
  ) : (
    <span className={cls} data-empty="" />
  )
}

/** Select.Item には「強調された」ことを知らせるコールバックが無いので、render に渡る state.highlighted を見て通知する */
function HighlightProbe({ highlighted, onHighlight }: { highlighted: boolean; onHighlight: () => void }) {
  const ref = useRef(onHighlight)
  useEffect(() => {
    ref.current = onHighlight
  })
  useEffect(() => {
    if (highlighted) ref.current()
  }, [highlighted])
  return null
}

function LayerSelectDemo({ label, options, value, onChange, onActiveChange }: LayerSelectDemoProps) {
  const find = (key: string | null) => options.find((o) => toKey(o.id) === key)
  return (
    <Select.Root
      value={toKey(value)}
      modal={false}
      onValueChange={(key) => onChange(fromKey(key as string))}
      onOpenChange={(open) => {
        if (!open) onActiveChange(undefined)
      }}
    >
      <Select.Trigger className="cmp-baseui-select-trigger" aria-label={`${label}: ${find(toKey(value))?.name ?? '未設定'}`}>
        <Select.Value className="cmp-baseui-select-value">
          {(key: string) => {
            const option = find(key)
            return (
              <>
                <Thumb option={option} size="sm" />
                <span className="cmp-baseui-name">{option?.name ?? '未設定'}</span>
              </>
            )
          }}
        </Select.Value>
        <Select.Icon className="cmp-baseui-caret">
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="cmp-baseui-positioner" alignItemWithTrigger={false} sideOffset={2}>
          <Select.Popup className="cmp-baseui-popup" aria-label={label}>
            {options.map((option) => (
              <Select.Item
                key={toKey(option.id)}
                value={toKey(option.id)}
                label={option.name}
                className="cmp-baseui-option"
                render={(props, state) => (
                  <div {...props}>
                    <HighlightProbe highlighted={state.highlighted} onHighlight={() => onActiveChange(option.id)} />
                    {props.children}
                  </div>
                )}
              >
                <Thumb option={option} size="lg" />
                <Select.ItemText className="cmp-baseui-name">{option.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

export const impl: Impl = {
  key: 'baseui',
  name: 'Base UI',
  packages: '@base-ui/react@1.8.0',
  RowMenuDemo,
  LayerSelectDemo,
  notes: [
    'Menu・Select とも modal={false} で非モーダルにできる（ページはスクロール可、別のトリガーも1クリックで開く）。既定は Select が true',
    'ライブ強調: Root に onItemHighlighted 相当が無い。Select.Item の render(props, state) で state.highlighted を見て、子コンポーネントの useEffect から onActiveChange を呼んだ。閉じる時は Root の onOpenChange(false) で undefined',
    '注意: 強調が外れた（ポインタが一覧外へ出た等）ときは通知しないので、最後の候補が閉じるまで残る',
    'キーボード: 矢印・Home/End・Escape・先頭文字ジャンプ（label prop が対象）。端での循環は Menu のみ loopFocus で設定可。日本語の先頭文字ジャンプはIME確定前は効かない見込み（未検証）',
    '位置: Positioner が衝突回避（反転・シフト）を自動で行い、Portal で枠に切られない。alignItemWithTrigger={false} でネイティブ風の重ね合わせを無効化',
    '困った点: null を値にできない（未選択扱い）ので「未設定」は番兵の文字列に変換。Select.Value は children 関数で独自表示。サムネ付き項目は ItemText と自前の画像を並べるだけで素直',
    '行数: 約130行（tsx）＋約150行（css）',
    '統合時に修正: なし（実行してそのまま動いた。表の値は実測）',
  ],
}
