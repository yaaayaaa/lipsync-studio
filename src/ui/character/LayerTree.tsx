import { isEffectivelyVisible } from '../../core/psd/visibility'
import type { LayerId, LayerNode, VisibilityState } from '../../core/psd/types'

interface Props {
  tree: LayerNode[]
  visibility: VisibilityState
  mouthGroupId: LayerId | null
  onToggle(id: LayerId, visible: boolean): void
}

/** PSD と同じく上のレイヤーを上に並べる（ag-psd の配列は下から上）。flip は出さない。 */
export function LayerTree({ tree, visibility, mouthGroupId, onToggle }: Props) {
  return (
    <ul className="layer-tree" role="tree">
      <Nodes nodes={tree} groupName="root" {...{ tree, visibility, mouthGroupId, onToggle }} />
    </ul>
  )
}

function Nodes({ nodes, groupName, ...props }: Props & { nodes: LayerNode[]; groupName: string }) {
  return [...nodes]
    .reverse()
    .filter((n) => !n.flip)
    .map((node) => <Node key={node.id} node={node} groupName={groupName} {...props} />)
}

function Node({ node, groupName, ...props }: Props & { node: LayerNode; groupName: string }) {
  const { tree, visibility, mouthGroupId, onToggle } = props
  const checked = visibility[node.id] === true
  const dimmed = !isEffectivelyVisible(tree, visibility, node.id)
  const label = (
    <span className={`layer-name${node.isGroup ? ' group' : ''}${node.id === mouthGroupId ? ' mouth' : ''}`}>
      {node.name}
      {node.id === mouthGroupId && <span className="badge">口</span>}
    </span>
  )

  let control
  if (node.kind === 'forced') {
    control = <span className="layer-forced" title="常に表示（!）" aria-hidden />
  } else if (node.kind === 'radio') {
    control = <input type="radio" name={`radio-${groupName}`} checked={checked} onChange={() => onToggle(node.id, true)} />
  } else {
    control = <input type="checkbox" checked={checked} onChange={(e) => onToggle(node.id, e.target.checked)} />
  }

  return (
    <li role="treeitem" aria-expanded={node.isGroup ? true : undefined}>
      <label className={`layer-row${dimmed ? ' dimmed' : ''}`}>
        {control}
        {label}
      </label>
      {node.isGroup && node.children.length > 0 && (
        <ul role="group">
          <Nodes nodes={node.children} groupName={node.id} {...props} />
        </ul>
      )}
    </li>
  )
}
