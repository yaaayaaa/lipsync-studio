import type { Layer } from 'ag-psd'
import type { LayerId, LayerKind, LayerNode } from './types'

const FLIP_SUFFIX = /:flip(x|y|xy)$/

function parseName(rawName: string): { name: string; kind: LayerKind; flip: boolean } {
  const head = rawName[0]
  const kind: LayerKind = head === '*' ? 'radio' : head === '!' ? 'forced' : 'normal'
  return {
    name: kind === 'normal' ? rawName : rawName.slice(1),
    kind,
    flip: FLIP_SUFFIX.test(rawName),
  }
}

function build(layer: Layer, id: LayerId): LayerNode {
  const rawName = layer.name ?? ''
  const children = layer.children
  return {
    id,
    ...parseName(rawName),
    rawName,
    isGroup: Array.isArray(children),
    initiallyVisible: !layer.hidden,
    children: (children ?? []).map((c, i) => build(c, `${id}/${i}`)),
    source: layer,
  }
}

export function buildLayerTree(layers: Layer[]): LayerNode[] {
  return layers.map((l, i) => build(l, String(i)))
}

export function findNode(tree: LayerNode[], id: LayerId): LayerNode | undefined {
  let nodes = tree
  let found: LayerNode | undefined
  for (const part of id.split('/')) {
    found = nodes[Number(part)]
    if (!found) return undefined
    nodes = found.children
  }
  return found
}

export function parentId(id: LayerId): LayerId | null {
  const i = id.lastIndexOf('/')
  return i < 0 ? null : id.slice(0, i)
}
