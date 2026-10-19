import { useEffect, useId } from 'react'
import { Menu, MenuButton, MenuItem, Select, SelectItem, SelectPopover, useMenuStore, useSelectStore } from '@ariakit/react'
import { ChevronDown, EllipsisVertical } from 'lucide-react'
import type { Impl, LayerOption, LayerSelectDemoProps, RowMenuDemoProps } from '../contract'
import './ariakit.css'

const iconProps = { size: 16, 'aria-hidden': true } as const
// Select の値は文字列のみ。「未設定」(null) はこの番兵で表す
const NONE = '__none__'
const toValue = (id: string | null) => id ?? NONE
const fromValue = (value: string) => (value === NONE ? null : value)

function RowMenuDemo({ label, items, onSelect }: RowMenuDemoProps) {
  const store = useMenuStore({ placement: 'bottom-end' })
  return (
    <>
      <MenuButton store={store} className="cmp-ariakit-menu-button" aria-label={label} render={<button type="button" />}>
        <EllipsisVertical {...iconProps} />
      </MenuButton>
      <Menu store={store} portal gutter={4} className="cmp-ariakit-menu" aria-label={label}>
        {items.map((item) => (
          <MenuItem
            key={item.id}
            className={`cmp-ariakit-menu-item${item.danger ? ' cmp-ariakit-danger' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

function Thumb({ option, small }: { option: LayerOption | undefined; small?: boolean }) {
  const cls = `cmp-ariakit-thumb${small ? ' cmp-ariakit-thumb-sm' : ''}${option?.thumb ? '' : ' cmp-ariakit-thumb-empty'}`
  return <span className={cls} aria-hidden>{option?.thumb ? <img src={option.thumb} alt="" /> : null}</span>
}

function LayerSelectDemo({ label, options, value, onChange, onActiveChange }: LayerSelectDemoProps) {
  const uid = useId()
  const itemId = (i: number) => `${uid}-opt-${i}`
  const store = useSelectStore({
    value: toValue(value),
    setValue: (v) => onChange(fromValue(v)),
    placement: 'bottom-start',
  })
  const open = store.useState('open')
  const activeId = store.useState('activeId')
  const current = options.find((o) => o.id === value)

  // 強調中の項目をプレビューへ伝える。閉じたら undefined
  const activeIndex = open ? options.findIndex((_, i) => itemId(i) === activeId) : -1
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined
  const reported = !open ? undefined : activeOption ? activeOption.id : undefined
  useEffect(() => {
    onActiveChange(reported)
  }, [reported, onActiveChange])

  return (
    <>
      <Select store={store} className="cmp-ariakit-select" aria-label={`${label}: ${current?.name ?? '未設定'}`}>
        <Thumb option={current} small />
        <span className="cmp-ariakit-name">{current?.name ?? '未設定'}</span>
        <ChevronDown className="cmp-ariakit-caret" {...iconProps} />
      </Select>
      <SelectPopover store={store} portal gutter={4} fitViewport className="cmp-ariakit-list" aria-label={label}>
        {options.map((o, i) => (
          <SelectItem key={o.id ?? NONE} id={itemId(i)} value={toValue(o.id)} className="cmp-ariakit-option">
            <Thumb option={o} />
            <span className="cmp-ariakit-name">{o.name}</span>
          </SelectItem>
        ))}
      </SelectPopover>
    </>
  )
}

export const impl: Impl = {
  key: 'ariakit',
  name: 'Ariakit',
  packages: '@ariakit/react@0.4.40',
  RowMenuDemo,
  LayerSelectDemo,
  notes: [
    '非モーダル（Menu / SelectPopover とも modal の既定が false。modal={true} で切替可）。ブラウザでの実機確認は未実施（型検査のみ）',
    '即時プレビュー: store.useState(\'activeId\') を SelectItem に付けた id と突き合わせて onActiveChange を呼ぶ。ホバー・キーボードとも activeId が変わるので追加配線なし。閉じたら open=false で undefined。onActiveChange が毎回別の関数だと effect が再実行される点だけ注意',
    'キーボード: 矢印・Home/End・先頭文字ジャンプは Ariakit が標準で持つ（一覧は既定で端で止まる。focusLoop で折り返し可）。先頭文字は key の一致で見るので日本語（IME）入力で効くかは未検証',
    '位置決め: floating-ui 相当の flip/shift 内蔵。portal で body 直下に出るので親の overflow で切れない。fitViewport で画面に収め、最大高さは CSS の max-height 280px',
    '困った点: Select の値は文字列のみなので「未設定」(null) は番兵文字列に変換。項目の強調は data-active-item 属性で CSS を書く（クラスではない）。バンドルは他より大きめ',
    'コード量は tsx 約90行 + css 約140行',
    '統合時に修正: なし（実行してそのまま動いた。表の値は実測）',
  ],
}
