import { type Archetype, archetypeFor } from './archetypes'
import { folderToColor, type FolderColor } from './color'
import { BODY } from './motion'

export interface RawNode {
  path: string; label: string; depth: number; parent: string | null
  size: number; docType: string | null; folder: string
}
export interface TreeNode extends RawNode {
  children: TreeNode[]
  radius: number
  archetype: Archetype
  color: FolderColor
}

// Buduje drzewo z płaskiej listy + wylicza promień (wg rozmiaru pliku), kształt (doc-type) i kolor (folder).
export function buildTree(nodes: RawNode[]): TreeNode | null {
  const maxSize = Math.max(1, ...nodes.map((n) => n.size || 1))
  const radiusOf = (n: RawNode) => {
    const factor = 0.6 + 0.95 * Math.sqrt((n.size || 1) / maxSize)
    const floor = n.depth === 0 ? 1.0 : 0.6
    return BODY[Math.min(n.depth, 3)] * Math.min(1.8, Math.max(floor, factor))
  }
  const by = new Map<string, TreeNode>(nodes.map((n) => [n.path, {
    ...n, children: [], radius: radiusOf(n),
    archetype: archetypeFor(n.docType, n.depth === 0),
    color: folderToColor(n.folder),
  }]))
  let root: TreeNode | null = null
  for (const n of by.values()) {
    if (n.depth === 0) root = n
    else if (n.parent && by.has(n.parent)) by.get(n.parent)!.children.push(n)
  }
  return root
}
