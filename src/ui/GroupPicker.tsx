import { useId, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { iconProps } from './icons'
import { searchGroups } from './groupSearch'
import type { PickerGroup } from './groupSearch'

export interface PickerSelection {
  groupId: string
  itemId: string
}

interface Props {
  /** 検索窓などの読み上げ名（例「キャラ・スタイル」「声」） */
  label: string
  /** 閉じているときに出す、今の選択 */
  current: string
  /** 今の選択の前に添える名前（並べたときに何の欄か分かるように。例「声」） */
  caption?: string
  groups: readonly PickerGroup[]
  selected: PickerSelection | null
  onChoose(selection: PickerSelection): void
  /** 見出しに入らない「選ばない」項目（1行編集の「キャラの声」など）。検索中は出さない */
  none?: { label: string; selected: boolean; onChoose(): void }
  disabled: boolean
  /** 選べるものが1つもないときの案内 */
  emptyHint: string
}

/**
 * 見出しごとに畳める選択欄（キャラ・スタイル、話者・声）。ふだんは今の選択だけを出して閉じておき、
 * 押すと開いて、上の検索窓で絞り込みながら選ぶ。選んだら閉じる。
 * 項目が多いと長くなるので見出しごとに畳む。開いたときは今の選択の見出しだけを開き、
 * 検索中は当たった見出しをすべて開いて見せる
 */
export function GroupPicker({ label, current, caption, groups, selected, onChoose, none, disabled, emptyHint }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // 開いて見せている見出し
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const listId = useId()
  // 書き出しで止まったら閉じる
  if (open && disabled) setOpen(false)

  const found = searchGroups(groups, query)
  const searching = query.trim() !== ''
  const show = () => {
    setExpanded(new Set(selected ? [selected.groupId] : []))
    setOpen(true)
  }
  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const choose = (selection: PickerSelection) => {
    onChoose(selection)
    close()
  }

  return (
    <div className="group-picker">
      <button
        type="button"
        className="group-picker-toggle"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
      >
        {caption && <span className="group-picker-caption">{caption}</span>}
        <span className="group-picker-current">{current}</span>
        <ChevronDown {...iconProps} className="group-picker-chevron" />
      </button>
      {open && (
        <div id={listId} className="group-picker-body">
          <label className="group-picker-search">
            <Search {...iconProps} />
            <input
              type="search"
              value={query}
              placeholder="検索"
              aria-label={`${label}を検索`}
              // 開いたらすぐ打てるように
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // 検索中の Enter で一番上の候補を選ぶ。Esc は、文字があればブラウザがまず文字を消すので、空のときに閉じる
                const first = found[0]
                if (e.key === 'Enter' && searching && first) choose({ groupId: first.id, itemId: first.items[0].id })
                if (e.key === 'Escape' && query === '') close()
              }}
            />
          </label>
          {found.length === 0 && !(none && !searching) ? (
            <p className="hint">{groups.length === 0 ? emptyHint : '見つかりません'}</p>
          ) : (
            <div className="group-picker-list">
              {none && !searching && (
                <button
                  type="button"
                  className={none.selected ? 'group-picker-none selected' : 'group-picker-none'}
                  aria-pressed={none.selected}
                  onClick={() => {
                    none.onChoose()
                    close()
                  }}
                >
                  <span className="group-picker-name">{none.label}</span>
                </button>
              )}
              {found.map((group) => {
                const unfolded = searching || expanded.has(group.id)
                const itemsId = `${listId}-${group.id}`
                return (
                  <div key={group.id} className="group-picker-group">
                    <button
                      type="button"
                      className="group-picker-heading"
                      aria-expanded={unfolded}
                      aria-controls={itemsId}
                      // 検索中は当たったものを全部見せるので畳めない
                      disabled={searching}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <ChevronRight {...iconProps} size={14} className="group-picker-chevron" />
                      <span className="group-picker-heading-name">{group.name}</span>
                      <span className="group-picker-count">{group.items.length}</span>
                    </button>
                    {unfolded && (
                      <div id={itemsId} role="group" aria-label={group.name}>
                        {group.items.map((item) => {
                          const isSelected = selected?.groupId === group.id && selected.itemId === item.id
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={isSelected ? 'group-picker-option selected' : 'group-picker-option'}
                              aria-pressed={isSelected}
                              onClick={() => choose({ groupId: group.id, itemId: item.id })}
                            >
                              <span className="group-picker-name">{item.name}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
