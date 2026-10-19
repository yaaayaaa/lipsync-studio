import { Button, ListBox, ListBoxItem, Menu, MenuItem, MenuTrigger, Popover, Select, SelectValue } from 'react-aria-components'
import { Check, ChevronDown, EllipsisVertical } from 'lucide-react'
import type { Key } from 'react-aria-components'
import type { Impl, LayerOption, LayerSelectDemoProps, RowMenuDemoProps } from '../contract'
import pkg from 'react-aria-components/package.json'
import './reactaria.css'

const NONE = '__none__'
const toKey = (id: string | null): string => id ?? NONE
const fromKey = (key: Key | null): string | null => (key === null || key === NONE ? null : String(key))

function RowMenuDemo({ label, items, onSelect }: RowMenuDemoProps) {
  return (
    <MenuTrigger>
      <Button className="cmp-reactaria-trigger" aria-label={label}>
        <EllipsisVertical size={16} />
      </Button>
      {/* isNonModal: 背景を操作でき、ページもスクロールできる */}
      <Popover className="cmp-reactaria-popover" placement="bottom end" isNonModal>
        <Menu className="cmp-reactaria-menu" onAction={(key) => onSelect(String(key))}>
          {items.map((item) => (
            <MenuItem
              key={item.id}
              id={item.id}
              className={`cmp-reactaria-menu-item${item.danger ? ' cmp-reactaria-danger' : ''}`}
            >
              {item.label}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  )
}

function Thumb({ thumb, size }: { thumb: string | null; size: number }) {
  return thumb === null ? (
    <span className="cmp-reactaria-thumb cmp-reactaria-thumb-empty" style={{ width: size, height: size }} />
  ) : (
    <img className="cmp-reactaria-thumb" src={thumb} alt="" style={{ width: size, height: size }} />
  )
}

function LayerSelectDemo({ label, options, value, onChange, onActiveChange }: LayerSelectDemoProps) {
  const active = (option: LayerOption) => onActiveChange(option.id)
  return (
    <Select
      className="cmp-reactaria-select"
      aria-label={label}
      selectedKey={toKey(value)}
      onSelectionChange={(key) => onChange(fromKey(key))}
      onOpenChange={(open) => {
        if (!open) onActiveChange(undefined)
      }}
    >
      <Button className="cmp-reactaria-select-button">
        <SelectValue className="cmp-reactaria-select-value">
          {({ selectedItem }) => {
            const option = selectedItem as LayerOption | null
            return option ? (
              <>
                <Thumb thumb={option.thumb} size={24} />
                <span className="cmp-reactaria-name">{option.name}</span>
              </>
            ) : null
          }}
        </SelectValue>
        <ChevronDown size={16} />
      </Button>
      <Popover className="cmp-reactaria-popover cmp-reactaria-select-popover" isNonModal>
        <ListBox className="cmp-reactaria-listbox" items={options.map((o) => ({ ...o, key: toKey(o.id) }))}>
          {(option) => (
            <ListBoxItem
              id={option.key}
              textValue={option.name}
              className="cmp-reactaria-option"
              // ホバーはフォーカスも動かすが、確実に拾うため両方を購読する
              onHoverStart={() => active(option)}
              onFocus={() => active(option)}
            >
              {({ isSelected }) => (
                <>
                  <Thumb thumb={option.thumb} size={32} />
                  <span className="cmp-reactaria-name">{option.name}</span>
                  {isSelected && <Check size={16} />}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  )
}

export const impl: Impl = {
  key: 'reactaria',
  name: 'React Aria Components',
  packages: `react-aria-components@${pkg.version}`,
  RowMenuDemo,
  LayerSelectDemo,
  notes: [
    '既定はモーダル（Popover が背景を操作不能にしスクロールも止める）。Popover の isNonModal で切替可能。Menu・Select の両方で指定した',
    '即時プレビュー: ListBoxItem の onFocus と onHoverStart で onActiveChange を呼ぶ。閉じるときは Select の onOpenChange(false) で undefined。開いた直後は選択中の項目への onFocus が一度発火する',
    'キーボード: 矢印・Home/End・先頭文字ジャンプ（textValue 基準、日本語の1文字目も前方一致で動く想定）。端での循環は既定ではしない',
    '位置決め: Popover が自動で配置し、下に入らなければ上へ反転。最大高さは画面に合わせて自動、max-height 280px を CSS で追加',
    '困った点: 未設定(null)はキーが文字列のみのため番兵 "__none__" に変換が必要。SelectValue は選択項目のオブジェクトを render prop で受け取るので items に key を足して渡した',
    '行数の目安: tsx 約100行 + css 約90行',
    '統合時に修正: プルダウンのボタンの min-width: 160px を幅100%に変更（あ・い を横に並べるとはみ出して い の見出しに重なったため）。挙動の修正は不要だった',
    '実測で判明: isNonModal でも一覧を開いたままページをスクロールすると一覧が閉じる（React Aria の仕様。スクロール自体はできる）',
  ],
}
