import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { currentRevision, fileCommitShas, readRepoFile } from '../git/worktree'
import { extractFrontmatter } from '../markdown/render'
import { getTree, type WorkspaceContext } from '../read-service'
import { type ApprovalStamp, reconcileApprovals, readApprovalStamp } from '../approvals/service'

const MD = /\.(md|markdown)$/i

// Status raportowy dokumentu (uniwersum = wszystkie .md widoczne w danym widoku).
export type DocStatus = 'approved' | 'changes_requested' | 'pending' | 'stale'

export interface ReportDoc {
  path: string
  title: string
  docType: string | null
  status: DocStatus
  approvedBy: string | null // email
  approvedByName: string | null
  approvedAt: string | null // ISO
}

export interface ReportsIndex {
  rev: string
  docs: ReportDoc[]
}

// — frontmatter helpers (zgodne z doc-graph.ts) —
function deriveTitle(meta: Record<string, unknown> | null, body: string, path: string): string {
  if (meta && typeof meta.name === 'string' && meta.name.trim()) return meta.name.trim()
  if (meta && typeof meta.title === 'string' && meta.title.trim()) return meta.title.trim()
  const h1 = body.match(/^#\s+(.+?)\s*#*\s*$/m)
  if (h1) { const t = h1[1].replace(/[*_`]/g, '').trim(); if (t) return t }
  return (path.split('/').pop() || path).replace(MD, '')
}
function deriveDocType(meta: Record<string, unknown> | null): string | null {
  const raw = meta?.['doc-type']
  if (typeof raw !== 'string' || !raw.trim()) return null
  return raw.trim().toLowerCase()
}

// — indeks na dysku (mirror doc-graph): przeżywa restart, reindeks gdy zmieni się rewizja repo —
const INDEX_DIR = join(process.env.WORKTREES_DIR ?? './data/worktrees', '..', 'reports-index')
const INDEX_VERSION = 'v2'
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
const indexFile = (ws: string, view: string, rev: string) => join(INDEX_DIR, `${sanitize(ws)}__${sanitize(view)}__${rev}.json`)

const CACHE = new Map<string, ReportsIndex>()

async function loadDisk(ws: string, view: string, rev: string): Promise<ReportsIndex | null> {
  if (!rev) return null
  try { return JSON.parse(await readFile(indexFile(ws, view, rev), 'utf8')) as ReportsIndex } catch { return null }
}
async function saveDisk(ws: string, view: string, rev: string, idx: ReportsIndex): Promise<void> {
  if (!rev) return
  try {
    await mkdir(INDEX_DIR, { recursive: true })
    await writeFile(indexFile(ws, view, rev), JSON.stringify(idx), 'utf8')
    const prefix = `${sanitize(ws)}__${sanitize(view)}__`
    const keep = `${prefix}${rev}.json`
    for (const f of await readdir(INDEX_DIR)) if (f.startsWith(prefix) && f !== keep) await unlink(join(INDEX_DIR, f)).catch(() => {})
  } catch (e) {
    console.warn('[osnova] reports index persist failed:', String((e as Error).message).split('\n')[0])
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

async function buildIndex(payload: Payload, ctx: WorkspaceContext, rev: string): Promise<ReportsIndex> {
  const files = (await getTree(ctx)).filter((p) => MD.test(p))
  const parsed = new Map<string, { title: string; docType: string | null; stamp: ApprovalStamp | null }>()
  await mapLimit(files, 24, async (f) => {
    let content = ''
    try { content = (await readRepoFile(ctx.worktreeDir, f)).toString('utf8') } catch { parsed.set(f, { title: (f.split('/').pop() || f).replace(MD, ''), docType: null, stamp: null }); return }
    const { meta, body } = extractFrontmatter(content)
    parsed.set(f, { title: deriveTitle(meta, body, f), docType: deriveDocType(meta), stamp: readApprovalStamp(meta) })
  })

  // masowe SHA ostatnich commitów (jedno przejście) → wykrycie „stale" bez per-plik git log
  let shas = new Map<string, string>()
  try { shas = await fileCommitShas(ctx.worktreeDir) } catch { shas = new Map() }

  // uzgodnij bazę ze stemplami (frontmatter = źródło prawdy); rewizja = aktualny commit pliku
  const stamped = files
    .filter((f) => parsed.get(f)?.stamp)
    .map((f) => ({ path: f, stamp: parsed.get(f)!.stamp!, revision: shas.get(f) ?? null }))
  try { await reconcileApprovals(payload, ctx, stamped) } catch { /* nie blokuj budowy indeksu */ }

  // najnowsza rewizja zatwierdzenia z bazy (po uzgodnieniu) — do dokładnego „stale"
  const approvedRev = new Map<string, string>()
  try {
    const rows = await payload.find({ collection: 'approvals', where: { workspace: { equals: ctx.workspaceId } }, sort: '-createdAt', limit: 5000, overrideAccess: true })
    for (const r of rows.docs as any[]) { if (!approvedRev.has(r.path) && r.revision) approvedRev.set(r.path, r.revision) }
  } catch { /* brak bazy → fallback bez „stale" */ }

  const docs: ReportDoc[] = files.map((f) => {
    const p = parsed.get(f)!
    const stamp = p.stamp
    let status: DocStatus = 'pending'
    if (stamp?.status === 'changes_requested') status = 'changes_requested'
    else if (stamp?.status === 'approved') {
      const appr = approvedRev.get(f)
      const cur = shas.get(f)
      status = appr && cur && appr !== cur ? 'stale' : 'approved'
    }
    return { path: f, title: p.title, docType: p.docType, status, approvedBy: stamp?.by ?? null, approvedByName: stamp?.name ?? null, approvedAt: stamp?.date ?? null }
  })
  return { rev, docs }
}

export async function getReportsIndex(payload: Payload, ctx: WorkspaceContext): Promise<ReportsIndex> {
  const rev0 = await currentRevision(ctx.worktreeDir).catch(() => '')
  const rev = rev0 ? `${INDEX_VERSION}-${rev0}` : ''
  const key = `${ctx.workspaceId}:${ctx.view}`
  const cached = CACHE.get(key)
  if (cached && cached.rev === rev && rev) return cached
  const disk = await loadDisk(ctx.workspaceId, ctx.view, rev)
  // uwaga: gdy ładujemy z dysku, uzgodnienie bazy zostało już wykonane przy pierwszej budowie
  const idx = disk ?? (await buildIndex(payload, ctx, rev))
  CACHE.set(key, idx)
  if (!disk) void saveDisk(ctx.workspaceId, ctx.view, rev, idx)
  return idx
}
