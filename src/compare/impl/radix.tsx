import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Select from '@radix-ui/react-select'
import { ChevronDown, ChevronUp, EllipsisVertical } from 'lucide-react'
import type { Impl, LayerOption, LayerSelectDemoProps, RowMenuDemoProps } from '../contract'
import './radix.css'

/** Radix Select は空文字の value を持てず null も使えないので、「未設定」をこの値で表す */
const NONE = '__none__'
const toValue = (id: string | null) => id ?? NONE
const fromValue = (v: string) => (v === NONE ? null : v)

function RowMenuDemo({ label, items, onSelect }: RowMenuDemoProps) {
  return (
    // modal={false}: ページのスクロールを止めず、別のトリガーも1クリックで開ける
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="cmp-radix-trigger" aria-label={label}>
        <EllipsisVertical size={16} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="cmp-radix-menu" align="end" sideOffset={2} collisionPadding={8}>
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              className={`cmp-radix-menu-item${item.danger ? ' danger' : ''}`}
              onSelect={() => onSelect(item.id)}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function Thumb({ thumb, size }: { thumb: string | null; size: 24 | 32 }) {
  return (
    <span
      className={`cmp-radix-thumb s${size}${thumb === null ? ' empty' : ''}`}
      style={thumb === null ? undefined : { backgroundImage: `url("${thumb}"), repeating-conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%)` }}
      aria-hidden
    />
  )
}

function LayerSelectDemo({ label, options, value, onChange, onActiveChange }: LayerSelectDemoProps) {
  const current: LayerOption | undefined = options.find((o) => o.id === value)

  return (
    <Select.Root
      value={toValue(value)}
      onValueChange={(v) => onChange(fromValue(v))}
      // 開閉に合わせて「指している候補」を片付ける。開いている間の更新は項目の onFocus で行う
      onOpenChange={(open) => {
        if (!open) onActiveChange(undefined)
      }}
    >
      <Select.Trigger className="cmp-radix-select" aria-label={`${label}: ${current?.name ?? '未設定'}`}>
        <Thumb thumb={current?.thumb ?? null} size={24} />
        <span className="cmp-radix-name">
          <Select.Value>{current?.name ?? '未設定'}</Select.Value>
        </span>
        <Select.Icon asChild>
          <ChevronDown className="cmp-radix-caret" size={16} aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="cmp-radix-list"
          aria-label={label}
          position="popper"
          side="bottom"
          align="start"
          sideOffset={2}
          collisionPadding={8}
        >
          <Select.ScrollUpButton className="cmp-radix-scroll">
            <ChevronUp size={16} aria-hidden />
          </Select.ScrollUpButton>
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item
                key={toValue(o.id)}
                value={toValue(o.id)}
                textValue={o.name}
                className="cmp-radix-option"
                // Radix がホバーやキー移動で項目へフォーカスを移すので、それを「指している候補」とする
                onFocus={() => onActiveChange(o.id)}
              >
                <Thumb thumb={o.thumb} size={32} />
                <span className="cmp-radix-name">
                  <Select.ItemText>{o.name}</Select.ItemText>
                </span>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="cmp-radix-scroll">
            <ChevronDown size={16} aria-hidden />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export const impl: Impl = {
  key: 'radix',
  name: 'Radix UI',
  packages: '@radix-ui/react-dropdown-menu@2.1.24, @radix-ui/react-select@2.3.7',
  RowMenuDemo,
  LayerSelectDemo,
  notes: [
    'DropdownMenu は modal={false} で非モーダルにできる（ページはスクロール可、別トリガーも1クリック）。Select には modal 指定が無く、開いている間は外側が操作できず body のスクロールもロックされる（設定不可）。',
    '指している候補: Radix が項目へ実際にフォーカスを移すので、Select.Item の onFocus で onActiveChange を呼ぶ。閉じるときは Root の onOpenChange(false) で undefined。開いた直後は選択中の項目にフォーカスが当たり、その候補が通知される。',
    'キー操作: 上下で移動、Home/End 対応、先頭文字ジャンプあり（textValue を指定。日本語は IME 入力中でない直接入力の前方一致なので実用は弱い）。Select は端で循環しない、DropdownMenu は loop 指定で循環可。',
    '配置: position="popper" で Floating UI による衝突回避（上下反転・collisionPadding）。高さは --radix-select-content-available-height と 280px の小さい方で、はみ出し分は上下のスクロールボタンで送れる。幅は --radix-select-trigger-width 以上。',
    '困った点: 「未設定」(null) を value にできないため番兵値 "__none__" が必要。ホバー時のフォーカス移動に頼るので、マウスが乗ったままキー操作すると競合しうる。Select.Item の選択中マーク用に data-state=checked をCSSで拾う必要あり。',
    '行数の目安: tsx 約120行 + css 約130行。依存はパッケージ2つ（内部で popper / focus-scope / dismissable-layer などを引く）。',
    '統合時に修正: なし（実行してそのまま動いた。表の値は実測）',
  ],
}
