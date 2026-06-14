import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { currentRevision, readRepoFile } from './git/worktree'
import type { TreeNode } from './docs-tree'
import { extractFrontmatter } from './markdown/render'
import { getTree, type WorkspaceContext } from './read-service'

const MD = /\.(md|markdown)$/i

// Przyjazna nazwa dokumentu: `name` z frontmattera → `title` → pierwszy H1 → null
// (null = wołający użyje nazwy pliku). Zgodne z deriveTitle w doc-graph.ts/reports.
export function deriveTitle(meta: Record<string, unknown> | null, body: string): string | null {
  if (meta && typeof meta.name === 'string' && meta.name.trim()) return meta.name.trim()
  if (meta && typeof meta.title === 'string' && meta.title.trim()) return meta.title.trim()
  const h1 = body.match(/^#\s+(.+?)\s*#*\s*$/m)
  if (h1) { const t = h1[1].replace(/[*_`]/g, '').trim(); if (t) return t }
  return null
}

// — indeks tytułów per (ws, widok, rewizja): mirror doc-graph.ts, przeżywa restart —
const INDEX_DIR = join(process.env.WORKTREES_DIR ?? './data/worktrees', '..', 'titles-index')
const INDEX_VERSION = 'v1'
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
const indexFile = (ws: string, view: string, rev: string) => join(INDEX_DIR, `${sanitize(ws)}__${sanitize(view)}__${rev}.json`)

const CACHE = new Map<string, { rev: string; titles: Record<string, string> }>()

async function loadDisk(ws: string, view: string, rev: string): Promise<Record<string, string> | null> {
  if (!rev) return null
  try { return JSON.parse(await readFile(indexFile(ws, view, rev), 'utf8')) as Record<string, string> } catch { return null }
}
async function saveDisk(ws: string, view: string, rev: string, titles: Record<string, string>): Promise<void> {
  if (!rev) return
  try {
    await mkdir(INDEX_DIR, { recursive: true })
    await writeFile(indexFile(ws, view, rev), JSON.stringify(titles), 'utf8')
    const prefix = `${sanitize(ws)}__${sanitize(view)}__`
    const keep = `${prefix}${rev}.json`
    for (const f of await readdir(INDEX_DIR)) if (f.startsWith(prefix) && f !== keep) await unlink(join(INDEX_DIR, f)).catch(() => {})
  } catch (e) {
    console.warn('[osnova] titles index persist failed:', String((e as Error).message).split('\n')[0])
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

async function build(ctx: WorkspaceContext): Promise<Record<string, string>> {
  const files = (await getTree(ctx)).filter((p) => MD.test(p))
  const titles: Record<string, string> = {}
  await mapLimit(files, 24, async (f) => {
    try {
      const { meta, body } = extractFrontmatter((await readRepoFile(ctx.worktreeDir, f)).toString('utf8'))
      const t = deriveTitle(meta, body)
      if (t) titles[f] = t
    } catch { /* pomiń nieczytelne */ }
  })
  return titles
}

// Mapa ścieżka→przyjazna nazwa dla plików .md w widoku (tylko wpisy z nietrywialną nazwą).
export async function getTitles(ctx: WorkspaceContext): Promise<Map<string, string>> {
  const rev0 = await currentRevision(ctx.worktreeDir).catch(() => '')
  const rev = rev0 ? `${INDEX_VERSION}-${rev0}` : ''
  const key = `${ctx.workspaceId}:${ctx.view}`
  let cached = CACHE.get(key)
  if (!cached || cached.rev !== rev || !rev) {
    const disk = rev ? await loadDisk(ctx.workspaceId, ctx.view, rev) : null
    const titles = disk ?? (await build(ctx))
    cached = { rev, titles }
    CACHE.set(key, cached)
    if (!disk && rev) void saveDisk(ctx.workspaceId, ctx.view, rev, titles)
  }
  return new Map(Object.entries(cached.titles))
}

// Podmienia etykiety węzłów-plików/bundli na przyjazne nazwy z frontmattera (gdy istnieją).
// Foldery i sekcje zachowują etykiety strukturalne. Filename pozostaje w `node.path` (tooltip).
function walk(nodes: TreeNode[], titles: Map<string, string>): void {
  for (const n of nodes) {
    if (n.type === 'file' && n.path) { const t = titles.get(n.path); if (t) n.label = t }
    else if (n.type === 'bundle') {
      if (n.primaryFile) { const t = titles.get(n.primaryFile); if (t) n.label = t }
      if (n.tabs) for (const tab of n.tabs) { const t = titles.get(tab.path); if (t) tab.label = t }
    }
    if (n.children?.length) walk(n.children, titles)
  }
}

export async function applyTitles(ctx: WorkspaceContext, nodes: TreeNode[]): Promise<void> {
  try { walk(nodes, await getTitles(ctx)) } catch { /* tytuły to ulepszenie — nie blokuj drzewa */ }
}
