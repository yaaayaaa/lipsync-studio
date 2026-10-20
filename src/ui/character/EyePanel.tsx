import { useState } from 'react'
import type { Character, EyeMap } from '../../core/character/types'
import { findNode } from '../../core/psd/layerTree'
import type { LayerId, LayerNode, VisibilityState } from '../../core/psd/types'
import type { PsdSize } from '../usePsd'
import { LayerSelect } from './LayerSelect'
import { groupOptions } from './groupOptions'
import { eyeGroupChoicePatch } from './mouthGroup'

interface Props {
  tree: LayerNode[]
  character: Character
  /** ツリーの表示状態（グループのサムネイルに使う） */
  visibility: VisibilityState
  psdSize: PsdSize
  onChange(patch: { eyeGroupId: LayerId | null; eyeMap: EyeMap }): void
}

type SelectKey = 'group' | 'closed' | 'half'

function assign(map: EyeMap, key: 'closed' | 'half', layerId: LayerId | null): EyeMap {
  const next = { ...map }
  if (layerId === null) delete next[key]
  else next[key] = layerId
  return next
}

export function EyePanel({ tree, character, visibility, psdSize, onChange }: Props) {
  const { eyeGroupId = null, eyeMap = {}, mouthGroupId } = character
  const eyeGroup = eyeGroupId === null ? undefined : findNode(tree, eyeGroupId)
  const eyeOptions = eyeGroup
    ? [...eyeGroup.children]
        .reverse()
        .filter((n) => !n.flip)
        .map((n) => ({ node: n, label: n.name }))
    : []
  const thumb = { visibility, psdSize }
  /** 開いているドロップダウン（同時に1つだけ） */
  const [openSelect, setOpenSelect] = useState<SelectKey | null>(null)
  const openProps = (key: SelectKey) => ({
    open: openSelect === key,
    onOpenChange: (open: boolean) => {
      // 閉じる知らせが、すでに開いた別のドロップダウンを閉じないようにする
      setOpenSelect((cur) => (open ? key : cur === key ? null : cur))
    },
  })

  const chooseGroup = (id: LayerId | null) => {
    const patch = eyeGroupChoicePatch(eyeGroupId, id)
    if (patch) onChange(patch)
  }

  return (
    <section className="panel">
      <h2>目（瞬き）</h2>
      <div className="mouth-group-field">
        <span aria-hidden>目のグループ</span>
        <LayerSelect
          label="目のグループ"
          options={groupOptions(tree, mouthGroupId)}
          value={eyeGroup ? eyeGroup.id : null}
          onChange={chooseGroup}
          {...openProps('group')}
          {...thumb}
        />
      </div>
      {eyeGroupId !== null && !eyeGroup && (
        <p className="notice error">設定された目のグループが PSD に見つかりません。選び直してください。</p>
      )}
      {eyeGroup ? (
        <div className="vowel-grid eye-grid">
          <div className="field">
            <span aria-hidden>閉じ目</span>
            <LayerSelect
              label="閉じ目"
              options={eyeOptions}
              value={eyeMap.closed ?? null}
              {...openProps('closed')}
              onChange={(id) => onChange({ eyeGroupId, eyeMap: assign(eyeMap, 'closed', id) })}
              {...thumb}
            />
          </div>
          <div className="field">
            <span aria-hidden>半目（任意）</span>
            <LayerSelect
              label="半目"
              options={eyeOptions}
              value={eyeMap.half ?? null}
              {...openProps('half')}
              onChange={(id) => onChange({ eyeGroupId, eyeMap: assign(eyeMap, 'half', id) })}
              {...thumb}
            />
          </div>
        </div>
      ) : (
        <p className="hint">目のグループを選ぶと、閉じ目と半目を選べます。</p>
      )}
      <p className="hint">閉じ目を選ぶと、書き出しとプレビューで瞬きします。開いた目はスタイルの表示のまま使います。</p>
    </section>
  )
}
