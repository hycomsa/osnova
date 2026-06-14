import { parse } from 'yaml'

export type NodeType = 'section' | 'bundle' | 'folder' | 'file'
export interface TreeNode {
  type: NodeType
  id: string
  label: string
  path?: string // pełna ścieżka repo (file/bundle/folder)
  primaryFile?: string
  tabs?: { label: string; path: string }[]
  children?: TreeNode[]
}

interface SectionCfg {
  key: string
  label: string
  path: string
  indexFile?: string
  layout?: 'bundle_folders' | 'adr_flat' | 'tree'
  bundlePrefix?: string
  primaryFile?: string
  tabs?: { file: string; label: string }[]
  nestedStacks?: boolean
}
export interface DocsSectionsConfig {
  rootPath: string
  sections: SectionCfg[]
}

export function parseDocsSections(yamlText: string): DocsSectionsConfig | null {
  try {
    const d: any = parse(yamlText)
    if (!d || typeof d !== 'object' || !Array.isArray(d.sections)) return null
    const sections: SectionCfg[] = d.sections.map((s: any) => ({
      key: String(s.key),
      label: String(s.label ?? s.key),
      path: String(s.path ?? '.'),
      indexFile: s.index_file ?? undefined,
      layout: s.explorer?.layout ?? undefined,
      bundlePrefix: s.explorer?.bundle_dir_prefix ?? undefined,
      primaryFile: s.explorer?.primary_file ?? undefined,
      tabs: Array.isArray(s.explorer?.tabs)
        ? s.explorer.tabs.map((t: any) => ({ file: String(t.file), label: String(t.label ?? t.file) }))
        : undefined,
      nestedStacks: Boolean(s.explorer?.bundle_nested_stacks),
    }))
    return { rootPath: String(d.root_path ?? '.').replace(/\/+$/, ''), sections }
  } catch {
    return null
  }
}

const base = (p: string) => p.split('/').pop() ?? p
const joinp = (...xs: string[]) => xs.filter((x) => x && x !== '.').join('/')

/** Rekurencyjny tree (foldery/pliki) z listy ścieżek względem `prefix`. */
function buildPlainNodes(files: string[], prefix: string): TreeNode[] {
  const rootChildren: Record<string, any> = {}
  for (const full of files) {
    const relPart = prefix ? full.slice(prefix.length + 1) : full
    const segs = relPart.split('/')
    let level = rootChildren
    let acc = prefix
    segs.forEach((seg, i) => {
      acc = acc ? `${acc}/${seg}` : seg
      const isFile = i === segs.length - 1
      if (!level[seg]) level[seg] = { __node: isFile ? { type: 'file' as const, id: `file:${acc}`, label: seg, path: acc } : { type: 'folder' as const, id: `folder:${acc}`, label: seg, path: acc, children: {} } }
      if (!isFile) level = level[seg].__node.children
    })
  }
  const toArr = (obj: Record<string, any>): TreeNode[] => {
    const nodes = Object.values(obj).map((v: any) => v.__node) as TreeNode[]
    for (const n of nodes) if (n.type === 'folder') n.children = toArr(n.children as any)
    return nodes.sort((a, b) => (a.type === b.type ? a.label.localeCompare(b.label) : a.type === 'folder' ? -1 : 1))
  }
  return toArr(rootChildren)
}

function buildBundles(files: string[], sectionRoot: string, sec: SectionCfg): TreeNode[] {
  const bundles = new Map<string, string[]>()
  const loose: string[] = []
  for (const full of files) {
    const rel = full.slice(sectionRoot.length + 1).split('/')
    const idx = rel.findIndex((seg) => sec.bundlePrefix && seg.startsWith(sec.bundlePrefix))
    if (idx === -1) { loose.push(full); continue }
    const bundleDir = joinp(sectionRoot, ...rel.slice(0, idx + 1))
    if (!bundles.has(bundleDir)) bundles.set(bundleDir, [])
    bundles.get(bundleDir)!.push(full)
  }
  const makeBundle = (dir: string, bfiles: string[]): TreeNode => {
    const primaryPath = sec.primaryFile && bfiles.includes(`${dir}/${sec.primaryFile}`) ? `${dir}/${sec.primaryFile}` : bfiles[0]
    const tabs = (sec.tabs ?? [])
      .map((t) => ({ label: t.label, path: `${dir}/${t.file}` }))
      .filter((t) => bfiles.includes(t.path))
    return {
      type: 'bundle',
      id: `bundle:${dir}`,
      label: base(dir),
      path: dir,
      primaryFile: primaryPath,
      tabs: tabs.length ? tabs : undefined,
      children: bfiles.map((f) => ({ type: 'file' as const, id: `file:${f}`, label: base(f), path: f })).sort((a, b) => a.label.localeCompare(b.label)),
    }
  }
  const sortedBundles = [...bundles.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  // domyślnie: płaska lista bundli (np. intencje — brak katalogów-obszarów)
  if (!sec.nestedStacks) {
    const nodes = sortedBundles.map(([dir, bfiles]) => makeBundle(dir, bfiles))
    if (loose.length) nodes.push(...buildPlainNodes(loose, sectionRoot))
    return nodes
  }

  // bundle_nested_stacks: zachowaj katalogi-obszary między sekcją a bundlem (np. func-specs/APP/FUNC-…)
  const rootChildren: Record<string, { __node: TreeNode & { children?: any } }> = {}
  const descend = (relSegs: string[]): Record<string, any> => {
    let level: Record<string, any> = rootChildren
    let acc = sectionRoot
    for (let i = 0; i < relSegs.length - 1; i++) {
      const seg = relSegs[i]
      acc = joinp(acc, seg)
      if (!level[seg]) level[seg] = { __node: { type: 'folder' as const, id: `folder:${acc}`, label: seg, path: acc, children: {} } }
      level = level[seg].__node.children
    }
    return level
  }
  for (const [dir, bfiles] of sortedBundles) {
    const rel = dir.slice(sectionRoot.length + 1).split('/')
    descend(rel)[rel[rel.length - 1]] = { __node: makeBundle(dir, bfiles) }
  }
  for (const full of loose) {
    const rel = full.slice(sectionRoot.length + 1).split('/')
    descend(rel)[rel[rel.length - 1]] = { __node: { type: 'file' as const, id: `file:${full}`, label: base(full), path: full } }
  }
  const rank = (t: NodeType) => (t === 'folder' ? 0 : t === 'bundle' ? 1 : 2)
  const toArr = (obj: Record<string, any>): TreeNode[] => {
    const nodes = Object.values(obj).map((v: any) => v.__node) as TreeNode[]
    for (const n of nodes) if (n.type === 'folder') n.children = toArr(n.children as any)
    return nodes.sort((a, b) => (rank(a.type) !== rank(b.type) ? rank(a.type) - rank(b.type) : a.label.localeCompare(b.label)))
  }
  return toArr(rootChildren)
}

export function buildDocsTree(files: string[], config: DocsSectionsConfig | null): TreeNode[] {
  const sorted = [...files].sort()
  if (!config) return buildPlainNodes(sorted, '')

  const root = config.rootPath
  // przypisz pliki do sekcji wg najdłuższego dopasowania ścieżki (poza sekcją '.')
  const named = config.sections.filter((s) => s.path !== '.')
    .map((s) => ({ s, prefix: joinp(root, s.path) }))
    .sort((a, b) => b.prefix.length - a.prefix.length)
  const overview = config.sections.find((s) => s.path === '.')
  const bySection = new Map<string, string[]>()
  const overviewFiles: string[] = []
  for (const f of sorted) {
    if (root && !(f === root || f.startsWith(root + '/'))) { overviewFiles.push(f); continue }
    const hit = named.find(({ prefix }) => f === prefix || f.startsWith(prefix + '/'))
    if (hit) { (bySection.get(hit.s.key) ?? bySection.set(hit.s.key, []).get(hit.s.key)!).push(f) }
    else overviewFiles.push(f)
  }

  const out: TreeNode[] = []
  for (const s of config.sections) {
    if (s.path === '.') continue
    const sfiles = bySection.get(s.key)
    if (!sfiles || sfiles.length === 0) continue
    const sectionRoot = joinp(root, s.path)
    let children: TreeNode[]
    if (s.layout === 'bundle_folders') children = buildBundles(sfiles, sectionRoot, s)
    else if (s.layout === 'adr_flat') children = sfiles.map((f) => ({ type: 'file' as const, id: `file:${f}`, label: base(f), path: f })).sort((a, b) => a.label.localeCompare(b.label))
    else children = buildPlainNodes(sfiles, sectionRoot)
    out.push({ type: 'section', id: `section:${s.key}`, label: s.label, children })
  }
  if (overviewFiles.length) {
    const label = overview?.label ?? 'Pozostałe'
    out.unshift({ type: 'section', id: `section:${overview?.key ?? 'other'}`, label, children: buildPlainNodes(overviewFiles, root) })
  }
  return out
}
