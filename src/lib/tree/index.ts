// Czyste pomocniki dla „first-class" drzewa stron: indeksowanie węzłów po ścieżce
// oraz budowanie list ulubionych / ostatnio otwartych z rozwiązaniem etykiet.

export interface TreeNodeLike {
  type: 'section' | 'bundle' | 'folder' | 'file'
  id: string
  label: string
  path?: string
  primaryFile?: string
  children?: TreeNodeLike[]
}

export interface PathEntry { path: string; label: string }

// Buduje mapę ścieżka→etykieta dla otwieralnych węzłów (pliki oraz bundle z primaryFile).
export function indexNodesByPath(nodes: TreeNodeLike[]): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (list: TreeNodeLike[]) => {
    for (const n of list) {
      if (n.type === 'file' && n.path) {
        if (!map.has(n.path)) map.set(n.path, n.label)
      } else if (n.type === 'bundle' && n.primaryFile) {
        if (!map.has(n.primaryFile)) map.set(n.primaryFile, n.label)
      }
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return map
}

function baseName(path: string): string {
  const last = path.split('/').filter(Boolean).pop() || path
  return last.replace(/\.(md|markdown)$/i, '')
}

// Lista ostatnio otwartych: zachowuje kolejność, odrzuca duplikaty, ogranicza do `limit`.
// Etykieta pochodzi z indeksu drzewa, a w razie braku — z nazwy pliku.
export function pickRecent(recentPaths: string[], index: Map<string, string>, limit = 6): PathEntry[] {
  const seen = new Set<string>()
  const out: PathEntry[] = []
  for (const p of recentPaths) {
    if (!p || seen.has(p)) continue
    seen.add(p)
    out.push({ path: p, label: index.get(p) ?? baseName(p) })
    if (out.length >= limit) break
  }
  return out
}

// Lista ulubionych z aktualnymi etykietami (preferuj etykietę z drzewa, potem zapisaną, potem nazwę pliku).
export function resolveFavorites(
  favorites: Array<{ path: string; label?: string | null }>,
  index: Map<string, string>,
): PathEntry[] {
  const seen = new Set<string>()
  const out: PathEntry[] = []
  for (const f of favorites) {
    if (!f?.path || seen.has(f.path)) continue
    seen.add(f.path)
    out.push({ path: f.path, label: index.get(f.path) ?? (f.label || baseName(f.path)) })
  }
  return out
}
