import { useEffect, useRef } from 'react'
import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDown, EllipsisVertical } from 'lucide-react'
import type { Impl, LayerOption, LayerSelectDemoProps, RowMenuDemoProps } from '../contract'
import './headless.css'

function RowMenuDemo({ label, items, onSelect }: RowMenuDemoProps) {
  return (
    <Menu>
      <MenuButton className="cmp-headless-menu-button" aria-label={label}>
        <EllipsisVertical size={16} aria-hidden />
      </MenuButton>
      {/* modal={false}: ページのスクロールを止めず、他のトリガーも1クリックで効く */}
      <MenuItems anchor={{ to: 'bottom end', gap: 2, padding: 8 }} modal={false} className="cmp-headless-menu-items">
        {items.map((item) => (
          <MenuItem key={item.id}>
            <button
              type="button"
              className={`cmp-headless-menu-item${item.danger ? ' danger' : ''}`}
              style={{ display: 'block', width: '100%', border: 0, background: 'transparent', font: 'inherit', textAlign: 'left', color: item.danger ? 'var(--danger)' : 'inherit' }}
              onClick={() => onSelect(item.id)}
            >
              {item.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  )
}

function Thumb({ thumb, small }: { thumb: string | null; small?: boolean }) {
  const cls = `cmp-headless-thumb${small ? ' small' : ''}${thumb === null ? ' empty' : ''}`
  return thumb === null ? <span className={cls} /> : <img className={cls} src={thumb} alt="" />
}

/** ListboxOption の focus（キーボード／ホバーで指している）を親へ知らせる。 */
function OptionRow({ option, focus, onActive }: { option: LayerOption; focus: boolean; onActive: (id: string | null) => void }) {
  const onActiveRef = useRef(onActive)
  useEffect(() => {
    onActiveRef.current = onActive
  })
  useEffect(() => {
    if (focus) onActiveRef.current(option.id)
  }, [focus, option.id])
  return (
    <>
      <Thumb thumb={option.thumb} />
      <span className="cmp-headless-name">{option.name}</span>
    </>
  )
}

/** 一覧が閉じて外れたとき（ListboxOptions はアンマウントされる）に undefined を渡す。 */
function CloseNotifier({ onActiveChange }: { onActiveChange: LayerSelectDemoProps['onActiveChange'] }) {
  const ref = useRef(onActiveChange)
  useEffect(() => {
    ref.current = onActiveChange
  })
  useEffect(() => () => ref.current(undefined), [])
  return null
}

function LayerSelectDemo({ label, options, value, onChange, onActiveChange }: LayerSelectDemoProps) {
  const current = options.find((o) => o.id === value) ?? options[0]
  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton className="cmp-headless-select-button" aria-label={`${label}: ${current?.name ?? '未設定'}`}>
        <Thumb thumb={current?.thumb ?? null} small />
        <span className="cmp-headless-name">{current?.name ?? '未設定'}</span>
        <ChevronDown className="cmp-headless-caret" size={16} aria-hidden />
      </ListboxButton>
      <ListboxOptions anchor={{ to: 'bottom start', gap: 2, padding: 8 }} modal={false} className="cmp-headless-list">
        <CloseNotifier onActiveChange={onActiveChange} />
        {options.map((o) => (
          <ListboxOption key={o.id ?? '__none'} value={o.id} className="cmp-headless-option">
            {({ focus }) => <OptionRow option={o} focus={focus} onActive={onActiveChange} />}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  )
}

export const impl: Impl = {
  key: 'headless',
  name: 'Headless UI',
  packages: '@headlessui/react@2.2.10',
  RowMenuDemo,
  LayerSelectDemo,
  notes: [
    'modal は MenuItems / ListboxOptions の prop で、既定は true。modal={false} にすればページはスクロールでき、他のトリガーも1クリックで開く（設定可能）。',
    '即時ハイライト: ListboxOption の render prop `focus` を子コンポーネントで受け、useEffect で onActiveChange(id) を呼んだ。閉じると ListboxOptions がアンマウントされるので、その中の小さなコンポーネントのクリーンアップで onActiveChange(undefined) を呼ぶ。',
    '注意: ポインタが項目から外れると focus が false に戻るだけで通知は来ない（最後の候補が残る）。一覧が閉じるまで残る挙動。開いた直後に選択中の項目を指すかは開き方次第（マウスなら Nothing）。',
    'キーボード: ↑↓、Home/End（PageUp/PageDown も）、Esc、Tab、先頭文字ジャンプ（350ms 内の連続入力）あり。端での循環はしない。日本語の先頭文字は IME 確定前の key が1文字でなく届くため実質効かない見込み（未検証）。',
    '配置: anchor（floating-ui 内蔵）で bottom start / bottom end、gap、padding、画面端での反転・縮小まで自動。--button-width で一覧の幅をボタンに合わせた。portal 化も anchor 指定で自動。',
    '面倒な点: MenuItem は既定でフラグメントなので、自前の button を子にして data-focus を CSS で拾う。値が null の選択肢もそのまま value に使えた。ロジックは約90行（CSS別）。',
    '統合時に修正: なし（実行してそのまま動いた。表の値は実測）',
  ],
}
