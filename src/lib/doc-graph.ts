import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { currentRevision, readRepoFile } from './git/worktree'
import { extractFrontmatter } from './markdown/render'
import { getTree, type WorkspaceContext } from './read-service'

const MD = /\.(md|markdown)$/i
// linki markdown [tekst](cel) — bierzemy cel (bez tytułu w cudzysłowie)
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g

export interface DocGraphNode { path: string; label: string; depth: number; parent: string | null; size: number; docType: string | null; folder: string }
export interface DocGraphEdge { source: string; target: string }
export interface DocGraph {
  center: { path: string; label: string } | null
  depth: number
  nodes: DocGraphNode[]
  edges: DocGraphEdge[]
  truncated: boolean
}

// limity, by gęsto powiązane repo nie zabiło wizualizacji
const PER_NODE = 12
const MAX_NODES = 90

type Adjacency = {
  out: Map<string, Set<string>>
  titles: Map<string, string>
  sizes: Map<string, number>
  docTypes: Map<string, string>
  files: Set<string>
}

// Czytelna etykieta dokumentu: `name` z frontmattera → `title` → pierwszy nagłówek H1 → nazwa pliku.
// (w tym repo tytuł trzymany jest w polu `name`, nie `title`).
function deriveTitle(meta: Record<string, unknown> | null, body: string): string | null {
  if (meta && typeof meta.name === 'string' && meta.name.trim()) return meta.name.trim()
  if (meta && typeof meta.title === 'string' && meta.title.trim()) return meta.title.trim()
  const h1 = body.match(/^#\s+(.+?)\s*#*\s*$/m)
  if (h1) return h1[1].replace(/[*_`]/g, '').trim() || null
  return null
}

// Typ dokumentu z frontmattera (klucz `doc-type`) — znormalizowany do małych liter/myślnika.
function deriveDocType(meta: Record<string, unknown> | null): string | null {
  const raw = meta?.['doc-type']
  if (typeof raw !== 'string' || !raw.trim()) return null
  return raw.trim().toLowerCase()
}

// cache grafu połączeń per (workspace:widok) — przebudowa tylko gdy zmieni się rewizja repo
const CACHE = new Map<string, { rev: string; adj: Adjacency }>()

// Indeks na dysku: przeżywa restart procesu i jest „reindeksowany" automatycznie, gdy zmieni
// się rewizja repo (klucz pliku zawiera SHA). Katalog data/doc-graph-index (gitignored).
const INDEX_DIR = join(process.env.WORKTREES_DIR ?? './data/worktrees', '..', 'doc-graph-index')
// podbij, gdy zmieni się logika budowania indeksu/reguł widoku → unieważnia stare pliki indeksu
const INDEX_VERSION = 'v2'
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
const indexFile = (ws: string, view: string, rev: string) => join(INDEX_DIR, `${sanitize(ws)}__${sanitize(view)}__${rev}.json`)

function serializeAdj(a: Adjacency): string {
  return JSON.stringify({
    out: [...a.out].map(([k, v]) => [k, [...v]]),
    titles: [...a.titles], sizes: [...a.sizes], docTypes: [...a.docTypes], files: [...a.files],
  })
}
function deserializeAdj(s: string): Adjacency {
  const d = JSON.parse(s) as { out: [string, string[]][]; titles: [string, string][]; sizes: [string, number][]; docTypes: [string, string][]; files: string[] }
  return {
    out: new Map(d.out.map(([k, v]) => [k, new Set(v)])),
    titles: new Map(d.titles), sizes: new Map(d.sizes), docTypes: new Map(d.docTypes), files: new Set(d.files),
  }
}
async function loadDiskIndex(ws: string, view: string, rev: string): Promise<Adjacency | null> {
  if (!rev) return null
  try { return deserializeAdj(await readFile(indexFile(ws, view, rev), 'utf8')) } catch { return null }
}
async function saveDiskIndex(ws: string, view: string, rev: string, adj: Adjacency): Promise<void> {
  if (!rev) return
  try {
    await mkdir(INDEX_DIR, { recursive: true })
    await writeFile(indexFile(ws, view, rev), serializeAdj(adj), 'utf8')
    // posprzątaj nieaktualne rewizje tego samego (workspace, widok)
    const prefix = `${sanitize(ws)}__${sanitize(view)}__`
    const keep = `${prefix}${rev}.json`
    for (const f of await readdir(INDEX_DIR)) if (f.startsWith(prefix) && f !== keep) await unlink(join(INDEX_DIR, f)).catch(() => {})
  } catch (e) {
    console.warn('[osnova] doc-graph index persist failed:', String((e as Error).message).split('\n')[0])
  }
}

// Rozwiąż względny cel linku do ścieżki repo (POSIX), pomijając zewnętrzne/absolutne/kotwice.
function resolveTarget(fromFile: string, raw: string): string | null {
  let t = raw.trim().replace(/^<|>$/g, '').split('#')[0]
  if (!t) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//') || t.startsWith('/')) return null
  try { t = decodeURIComponent(t) } catch { /* zostaw */ }
  const baseDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : ''
  const parts: string[] = []
  for (const seg of `${baseDir ? baseDir + '/' : ''}${t}`.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') { parts.pop(); continue }
    parts.push(seg)
  }
  return parts.join('/')
}

// równoległe wykonanie z ograniczeniem (I/O-bound: odczyt setek plików)
async function mapLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

async function buildAdjacency(ctx: WorkspaceContext): Promise<Adjacency> {
  const files = (await getTree(ctx)).filter((p) => MD.test(p))
  const set = new Set(files)
  const out = new Map<string, Set<string>>()
  const titles = new Map<string, string>()
  const sizes = new Map<string, number>()
  const docTypes = new Map<string, string>()
  // odczyt + parsowanie równolegle (wcześniej szeregowo → ~12s na 500 plików)
  await mapLimit(files, 24, async (f) => {
    let content = ''
    try { content = (await readRepoFile(ctx.worktreeDir, f)).toString('utf8') } catch { out.set(f, new Set()); return }
    sizes.set(f, content.length)
    const { meta, body } = extractFrontmatter(content)
    const title = deriveTitle(meta, body)
    if (title) titles.set(f, title)
    const dt = deriveDocType(meta)
    if (dt) docTypes.set(f, dt)
    const targets = new Set<string>()
    const re = new RegExp(LINK_RE.source, 'g') // własny regex per plik (współbieżność → bez współdzielonego lastIndex)
    let m: RegExpExecArray | null
    while ((m = re.exec(content))) {
      const r = resolveTarget(f, m[1])
      if (r && r !== f && set.has(r)) targets.add(r)
    }
    out.set(f, targets)
  })
  return { out, titles, sizes, docTypes, files: set }
}

const folderOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

export async function getDocGraph(ctx: WorkspaceContext, centerPath: string, depthInput: number): Promise<DocGraph> {
  const depth = Math.max(1, Math.min(3, Math.trunc(depthInput) || 2))
  const rev0 = await currentRevision(ctx.worktreeDir).catch(() => '')
  const rev = rev0 ? `${INDEX_VERSION}-${rev0}` : '' // wersja indeksu w kluczu → zmiana reguł unieważnia cache
  const key = `${ctx.workspaceId}:${ctx.view}`
  let cached = CACHE.get(key)
  if (!cached || cached.rev !== rev) {
    // pamięć → dysk (przeżywa restart) → pełna przebudowa (i zapis indeksu na dysk)
    const disk = await loadDiskIndex(ctx.workspaceId, ctx.view, rev)
    const adj = disk ?? (await buildAdjacency(ctx))
    cached = { rev, adj }
    CACHE.set(key, cached)
    if (!disk) void saveDiskIndex(ctx.workspaceId, ctx.view, rev, adj)
  }
  const { out, titles, sizes, docTypes, files } = cached.adj

  const label = (p: string) => titles.get(p) || (p.split('/').pop() || p).replace(MD, '')
  const sizeOf = (p: string) => sizes.get(p) ?? 0
  const docTypeOf = (p: string) => docTypes.get(p) ?? null
  if (!files.has(centerPath)) return { center: { path: centerPath, label: label(centerPath) }, depth, nodes: [], edges: [], truncated: false }

  // sąsiedztwo nieskierowane (linki w obie strony)
  const inMap = new Map<string, Set<string>>()
  for (const [a, ts] of out) for (const b of ts) { (inMap.get(b) ?? inMap.set(b, new Set()).get(b)!).add(a) }
  const neighbors = (p: string) => new Set<string>([...(out.get(p) ?? []), ...(inMap.get(p) ?? [])])

  // BFS z zapamiętaniem rodzica (do orbitalnego zagnieżdżenia: księżyce wokół planet)
  const levels = new Map<string, number>([[centerPath, 0]])
  const parents = new Map<string, string | null>([[centerPath, null]])
  let frontier = [centerPath]
  let truncated = false
  for (let d = 1; d <= depth; d++) {
    const next: string[] = []
    for (const p of frontier) {
      const ns = [...neighbors(p)].sort()
      let taken = 0
      for (const n of ns) {
        if (levels.has(n)) continue
        if (taken >= PER_NODE || levels.size >= MAX_NODES) { truncated = true; break }
        levels.set(n, d); parents.set(n, p); next.push(n); taken += 1
      }
      if (levels.size >= MAX_NODES) { truncated = true; break }
    }
    frontier = next
  }

  const nodeSet = new Set(levels.keys())
  const nodes: DocGraphNode[] = [...levels].map(([path, d]) => ({
    path, label: label(path), depth: d, parent: parents.get(path) ?? null,
    size: sizeOf(path), docType: docTypeOf(path), folder: folderOf(path),
  }))
  const edges: DocGraphEdge[] = []
  for (const a of nodeSet) for (const b of out.get(a) ?? []) if (nodeSet.has(b)) edges.push({ source: a, target: b })
  return { center: { path: centerPath, label: label(centerPath) }, depth, nodes, edges, truncated }
}
