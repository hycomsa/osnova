import { join } from 'node:path'
import type { Payload } from 'payload'
import { filterTree, isAttachmentPath, isPathAllowed, isReadable } from './content-access'
import { blame, commitAndPush, commitBinaryAndPush, deleteAndPush, ensureWorktree, fileAtRevision, fileDiff, fileHistory, invalidateWorktreeFetch, listFiles, listIgnoredTracked, moveAndPush, pathExists, readRepoFile, withToken } from './git/worktree'
import { type FileDiff, parseUnifiedDiff } from './git/diff'
import { stringify as stringifyYaml } from 'yaml'
import { logAudit } from './audit'
import type { AuditAction } from '@/collections/AuditLog'
import { extractFrontmatter, renderMarkdown, renderMetadataTable } from './markdown/render'
import { canAccessView, canEdit, effectivePermissions, effectiveViews, hasPermission, type Permission, type ViewName, type WorkspaceRole } from './roles'
import { parseDocsConfig, resolveViewRules, type RulesSource, type ViewRules } from './view-rules'
import { extractTags, parseFrontmatter } from './frontmatter'
import { buildDocsTree, parseDocsSections, type TreeNode } from './docs-tree'

export class AccessDenied extends Error {
  status = 403 as const
}
export class NotFound extends Error {
  status = 404 as const
}
export class Conflict extends Error {
  status = 409 as const
}

// Pliki wewnętrzne/„meta" frameworku — ukrywane domyślnie w widokach klienckich
// (nie są treścią dla klienta). Widok bezpośredni (dostawca/admin) je pokazuje.
const CLIENT_VIEW_EXCLUDES = [
  '.ai/context/README.md',
  '**/project-config.md',
  '**/state.md',
  '**/changelog.md',
]

export interface RequestUserRef {
  id: string | number
  globalRoles?: string[] | null
  email?: string | null
}

export interface WorkspaceContext {
  workspaceId: string
  view: ViewName
  rules: ViewRules
  worktreeDir: string
  allowedViews: ViewName[]
  roles: WorkspaceRole[]
  permissions: Permission[]   // efektywne uprawnienia (role + nadane − odebrane)
  isSystemAdmin: boolean
  branch: string
  showMetadata: boolean
  workspaceSlug?: string
  workspaceName?: string
  // do audytu / instrumentacji (nie ujawniane klientowi)
  payload: Payload
  userId: string
  userEmail?: string
}

export interface WorkspaceRef { id: number | string; slug?: string; name?: string }

export async function resolveWorkspace(payload: Payload, idOrSlug: string): Promise<WorkspaceRef> {
  const numeric = /^\d+$/.test(String(idOrSlug))
  const res = numeric
    ? await payload.find({ collection: 'workspaces', where: { id: { equals: Number(idOrSlug) } }, limit: 1, overrideAccess: true })
    : await payload.find({ collection: 'workspaces', where: { slug: { equals: idOrSlug } }, limit: 1, overrideAccess: true })
  const w = res.docs[0] as any
  if (!w) throw new NotFound(`Workspace not found: ${idOrSlug}`)
  return { id: w.id, slug: w.slug, name: w.name }
}

export async function getWorkspaceContext(opts: {
  payload: Payload
  user: RequestUserRef
  workspaceId: string
  view: ViewName
  forceFetch?: boolean
}): Promise<WorkspaceContext> {
  const { payload, user, workspaceId: idOrSlug, view, forceFetch } = opts
  const isSystemAdmin = (user.globalRoles ?? []).includes('system_admin')

  const ws = await resolveWorkspace(payload, idOrSlug)
  const workspaceId = String(ws.id)

  const memberships = await payload.find({
    collection: 'memberships',
    where: { and: [{ workspace: { equals: workspaceId } }, { user: { equals: user.id } }] },
    limit: 1,
    overrideAccess: true,
  })
  const membership = memberships.docs[0] as any
  const roles = (membership?.roles ?? []) as WorkspaceRole[]
  if (!isSystemAdmin && roles.length === 0) {
    void logAudit(payload, { action: 'access-denied', workspaceId, userId: String(user.id), userEmail: user.email, view, detail: 'no membership' })
    throw new AccessDenied('No membership in workspace')
  }
  const granted = (membership?.grantedPermissions ?? []) as Permission[]
  const revoked = (membership?.revokedPermissions ?? []) as Permission[]
  const viewOverride = (membership?.viewAccess ?? []) as ViewName[]
  const permissions = effectivePermissions(roles, granted, revoked, isSystemAdmin)
  const computedViews = effectiveViews(roles, viewOverride, isSystemAdmin)
  if (!canAccessView(computedViews, view)) {
    void logAudit(payload, { action: 'access-denied', workspaceId, userId: String(user.id), userEmail: user.email, view, detail: 'view not allowed for role' })
    throw new AccessDenied('View not allowed for role')
  }

  const bindings = await payload.find({
    collection: 'repo-bindings',
    where: { workspace: { equals: workspaceId } },
    limit: 1,
    overrideAccess: true,
  })
  const binding = bindings.docs[0] as any
  if (!binding) throw new NotFound('Workspace has no repo binding')

  const branch = String(binding.branch || 'main')
  const worktreeDir = join(process.env.WORKTREES_DIR ?? './data/worktrees', String(workspaceId))
  const token = binding.credentialRef ? process.env[String(binding.credentialRef)] : undefined
  // polling rewizji wymusza świeży fetch (pomija throttle), by wykryć zmiany zewnętrzne
  if (forceFetch) invalidateWorktreeFetch(worktreeDir)
  await ensureWorktree({
    dir: worktreeDir,
    repoUrl: withToken(String(binding.repoUrl), token),
    branch,
  })

  let docsConfig = null
  try {
    const raw = await readRepoFile(worktreeDir, '.docs.config.yaml')
    docsConfig = parseDocsConfig(raw.toString('utf8'))
  } catch {
    docsConfig = null
  }

  // wszystkie 3 widoki są konfigurowalne w panelu admina (view-configs); direct domyślnie najbardziej permisywny
  const cfg = (
    await payload.find({
      collection: 'view-configs',
      where: { and: [{ workspace: { equals: workspaceId } }, { view: { equals: view } }] },
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0] as any
  const baseRules = resolveViewRules({
    view,
    docsConfig,
    override: cfg
      ? {
          include: ((cfg.includeGlobs ?? []) as { glob: string }[]).map((r) => r.glob),
          exclude: ((cfg.excludeGlobs ?? []) as { glob: string }[]).map((r) => r.glob),
        }
      : null,
    source: (cfg?.source as RulesSource | undefined) ?? 'hybrid',
    hideUnderscored: cfg ? (cfg.hideUnderscored as boolean | undefined) ?? null : null,
  })

  // GLOBALNY filtr widoczności (najpierw, dla każdego widoku łącznie z directm):
  // 1) .gitignore — pliki śledzone, ale ignorowane; 2) wszystkie .gitkeep
  // (nowy obiekt — nie mutujemy współdzielonych stałych FULL_RULES/EMPTY_RULES)
  const globEscape = (s: string) => s.replace(/[\\*?[\]{}()!+@|^$]/g, '\\$&')
  const ignoredTracked = await listIgnoredTracked(worktreeDir)
  // pliki wewnętrzne/„meta" projektu — domyślnie niewidoczne w widokach klienckich
  // (nie dotyczy widoku bezpośredniego dla dostawcy/admina)
  const clientHidden = view !== 'direct' ? CLIENT_VIEW_EXCLUDES : []
  const rules: ViewRules = {
    include: baseRules.include,
    exclude: [...baseRules.exclude, '**/.gitkeep', '.gitkeep', ...ignoredTracked.map(globEscape), ...clientHidden],
  }

  return {
    workspaceId,
    view,
    rules,
    worktreeDir,
    branch,
    roles,
    permissions,
    isSystemAdmin,
    showMetadata: cfg ? Boolean(cfg.showMetadata) : false,
    allowedViews: computedViews,
    workspaceSlug: ws.slug,
    workspaceName: ws.name,
    payload,
    userId: String(user.id),
    userEmail: user.email ?? undefined,
  }
}

// Skrót do audytu z kontekstu workspace (best-effort).
function audit(ctx: WorkspaceContext, action: AuditAction, extra?: { path?: string; detail?: string }): void {
  void logAudit(ctx.payload, {
    action, workspaceId: ctx.workspaceId, userId: ctx.userId, userEmail: ctx.userEmail,
    view: ctx.view, path: extra?.path, detail: extra?.detail,
  })
}

export async function getTree(ctx: WorkspaceContext): Promise<string[]> {
  const all = await listFiles(ctx.worktreeDir)
  return filterTree(all, ctx.rules)
}

const MD_RE = /\.(md|markdown)$/i
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export type DocumentResult =
  | { kind: 'markdown'; html: string }
  | { kind: 'binary'; data: Buffer; contentType: string }

export async function getDocument(ctx: WorkspaceContext, path: string): Promise<DocumentResult> {
  if (!isReadable(path, ctx.rules)) { audit(ctx, 'access-denied', { path, detail: 'read path outside view' }); throw new AccessDenied('Path outside view') }

  let data: Buffer
  try {
    data = await readRepoFile(ctx.worktreeDir, path)
  } catch {
    throw new NotFound(`File not found: ${path}`)
  }

  if (MD_RE.test(path)) {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
    const assetBase = `/api/ws/${ctx.workspaceId}/file?view=${ctx.view}&path=${encodeURIComponent(dir)}`
    const { meta, body } = extractFrontmatter(data.toString('utf8'))
    const prefix = ctx.showMetadata && meta ? renderMetadataTable(meta) : ''
    const html = prefix + (await renderMarkdown(body, { assetBase }))
    audit(ctx, 'document-opened', { path })
    return { kind: 'markdown', html }
  }

  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  audit(ctx, 'document-opened', { path, detail: 'binary' })
  return { kind: 'binary', data, contentType: MIME[ext] ?? 'application/octet-stream' }
}


export async function getRawDocument(ctx: WorkspaceContext, path: string): Promise<{ content: string }> {
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  try {
    const data = await readRepoFile(ctx.worktreeDir, path)
    return { content: data.toString('utf8') }
  } catch {
    throw new NotFound(`File not found: ${path}`)
  }
}

export async function writeDocument(
  ctx: WorkspaceContext,
  path: string,
  content: string,
  author: { name: string; email: string },
): Promise<{ commit: string }> {
  if (!canEdit(ctx.permissions, ctx.isSystemAdmin)) { audit(ctx, 'access-denied', { path, detail: 'edit' }); throw new AccessDenied('No edit permission') }
  if (!isPathAllowed(path, ctx.rules)) { audit(ctx, 'access-denied', { path, detail: 'edit path outside view' }); throw new AccessDenied('Path outside view') }
  const res = await commitAndPush({
    dir: ctx.worktreeDir,
    relPath: path,
    content,
    branch: ctx.branch,
    authorName: author.name,
    authorEmail: author.email,
    message: `osnova: edycja ${path}`,
    detectConflict: true, // przy konflikcie zwróć obie wersje do kreatora (FR-19a)
  })
  audit(ctx, 'commit-pushed', { path, detail: `edit ${res.commit.slice(0, 8)}` })
  return res
}

// re-eksport: trasa /tree filtruje załączniki tym helperem
export { isAttachmentPath }

export async function writeBinaryDocument(
  ctx: WorkspaceContext,
  path: string,
  data: Buffer,
  author: { name: string; email: string },
): Promise<{ commit: string }> {
  if (!canEdit(ctx.permissions, ctx.isSystemAdmin)) throw new AccessDenied('No edit permission')
  if (!isReadable(path, ctx.rules)) throw new AccessDenied('Path outside view')
  return commitBinaryAndPush({
    dir: ctx.worktreeDir,
    relPath: path,
    data,
    branch: ctx.branch,
    authorName: author.name,
    authorEmail: author.email,
    message: `osnova: załącznik ${path}`,
  })
}


function requirePerm(ctx: WorkspaceContext, perm: Permission): void {
  if (!hasPermission(ctx.permissions, perm, ctx.isSystemAdmin)) throw new AccessDenied(`Missing permission: ${perm}`)
}

function authorOf(a: { name: string; email: string }) {
  return { authorName: a.name, authorEmail: a.email }
}

export async function createDocument(
  ctx: WorkspaceContext,
  path: string,
  content: string,
  author: { name: string; email: string },
): Promise<{ commit: string }> {
  requirePerm(ctx, 'page-create')
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  if (await pathExists(ctx.worktreeDir, path)) throw new Conflict('File already exists')
  const res = await commitAndPush({ dir: ctx.worktreeDir, relPath: path, content, branch: ctx.branch, ...authorOf(author), message: `osnova: utworzenie ${path}` })
  audit(ctx, 'file-created', { path, detail: res.commit.slice(0, 8) })
  return res
}

export async function deleteDocument(
  ctx: WorkspaceContext,
  path: string,
  author: { name: string; email: string },
): Promise<{ commit: string }> {
  requirePerm(ctx, 'page-delete')
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  if (!(await pathExists(ctx.worktreeDir, path))) throw new NotFound(`File not found: ${path}`)
  const res = await deleteAndPush({ dir: ctx.worktreeDir, relPath: path, branch: ctx.branch, ...authorOf(author), message: `osnova: usunięcie ${path}` })
  audit(ctx, 'file-deleted', { path, detail: res.commit.slice(0, 8) })
  return res
}

export async function renameDocument(
  ctx: WorkspaceContext,
  from: string,
  to: string,
  author: { name: string; email: string },
): Promise<{ commit: string }> {
  requirePerm(ctx, 'page-rename')
  if (!isPathAllowed(from, ctx.rules) || !isPathAllowed(to, ctx.rules)) throw new AccessDenied('Path outside view')
  if (!(await pathExists(ctx.worktreeDir, from))) throw new NotFound(`File not found: ${from}`)
  if (await pathExists(ctx.worktreeDir, to)) throw new Conflict('Target already exists')
  const res = await moveAndPush({ dir: ctx.worktreeDir, from, to, branch: ctx.branch, ...authorOf(author), message: `osnova: zmiana nazwy ${from} → ${to}` })
  audit(ctx, 'file-renamed', { path: to, detail: `from ${from}` })
  return res
}

export async function duplicateDocument(
  ctx: WorkspaceContext,
  from: string,
  to: string,
  author: { name: string; email: string },
): Promise<{ commit: string }> {
  requirePerm(ctx, 'page-duplicate')
  if (!isPathAllowed(from, ctx.rules) || !isPathAllowed(to, ctx.rules)) throw new AccessDenied('Path outside view')
  if (!(await pathExists(ctx.worktreeDir, from))) throw new NotFound(`File not found: ${from}`)
  if (await pathExists(ctx.worktreeDir, to)) throw new Conflict('Target already exists')
  const data = await readRepoFile(ctx.worktreeDir, from)
  const res = await commitAndPush({ dir: ctx.worktreeDir, relPath: to, content: data.toString('utf8'), branch: ctx.branch, ...authorOf(author), message: `osnova: duplikacja ${from} → ${to}` })
  audit(ctx, 'file-duplicated', { path: to, detail: `from ${from}` })
  return res
}


// Przywrócenie pliku do treści z wybranej rewizji Git (FR-20a) — działa też dla pliku
// usuniętego w HEAD (kanon „bez kosza": przywracanie realizuje historia Git). To zapis,
// więc wymaga uprawnienia edycji i kończy się commitem + pushem.
export async function restoreDocument(
  ctx: WorkspaceContext,
  path: string,
  rev: string,
  author: { name: string; email: string },
): Promise<{ commit: string }> {
  if (!canEdit(ctx.permissions, ctx.isSystemAdmin)) throw new AccessDenied('No edit permission')
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  const content = await fileAtRevision(ctx.worktreeDir, rev, path)
  const res = await commitAndPush({
    dir: ctx.worktreeDir, relPath: path, content, branch: ctx.branch, ...authorOf(author),
    message: `osnova: przywrócenie ${path} z rewizji ${rev.slice(0, 8)}`,
    detectConflict: true,
  })
  audit(ctx, 'file-restored', { path, detail: `from ${rev.slice(0, 8)}` })
  return res
}

// Właściwości/metadane pliku (frontmatter YAML) — odczyt (FR-21). Wymaga props-view.
export async function getProperties(
  ctx: WorkspaceContext,
  path: string,
): Promise<{ meta: Record<string, unknown>; canEdit: boolean }> {
  if (!hasPermission(ctx.permissions, 'props-view', ctx.isSystemAdmin)) throw new AccessDenied('No props-view permission')
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  const data = await readRepoFile(ctx.worktreeDir, path)
  const { meta } = extractFrontmatter(data.toString('utf8'))
  return { meta: meta ?? {}, canEdit: hasPermission(ctx.permissions, 'props-edit', ctx.isSystemAdmin) }
}

// Skalarna koercja wartości z formularza: liczba / bool / JSON (tablica/obiekt) / string.
function coerceMetaValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  const s = raw.trim()
  if (s === '') return ''
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if (s.startsWith('[') || s.startsWith('{')) {
    try { return JSON.parse(s) } catch { /* zostaw jako string */ }
  }
  return raw
}

// Zapis właściwości/metadanych: przepisuje blok frontmatter, zachowując treść (FR-21).
// Wymaga props-edit; jak każdy zapis kończy się commitem + pushem.
export async function setProperties(
  ctx: WorkspaceContext,
  path: string,
  meta: Record<string, unknown>,
  author: { name: string; email: string },
): Promise<{ commit: string }> {
  if (!hasPermission(ctx.permissions, 'props-edit', ctx.isSystemAdmin)) throw new AccessDenied('No props-edit permission')
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  const data = await readRepoFile(ctx.worktreeDir, path)
  const { body } = extractFrontmatter(data.toString('utf8'))
  const coerced: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) if (k.trim()) coerced[k.trim()] = coerceMetaValue(v)
  const bodyTrimmed = body.replace(/^\s*\n/, '')
  const content = Object.keys(coerced).length
    ? `---\n${stringifyYaml(coerced).trimEnd()}\n---\n\n${bodyTrimmed}`
    : bodyTrimmed
  const res = await commitAndPush({
    dir: ctx.worktreeDir, relPath: path, content, branch: ctx.branch, ...authorOf(author),
    message: `osnova: właściwości ${path}`, detectConflict: true,
  })
  audit(ctx, 'properties-changed', { path, detail: res.commit.slice(0, 8) })
  return res
}

// Szybka zmiana nazwy WYŚWIETLANEJ (frontmatter `name`) — MERGE: zachowuje pozostałe pola
// frontmattera (w przeciwieństwie do setProperties, które zapisuje tylko przekazane klucze).
export async function setDisplayName(
  ctx: WorkspaceContext,
  path: string,
  name: string | null,
  author: { name: string; email: string },
): Promise<{ commit: string }> {
  if (!hasPermission(ctx.permissions, 'props-edit', ctx.isSystemAdmin)) throw new AccessDenied('No props-edit permission')
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  const data = await readRepoFile(ctx.worktreeDir, path)
  const { meta, body } = extractFrontmatter(data.toString('utf8'))
  const next: Record<string, unknown> = { ...(meta ?? {}) }
  const trimmed = name?.trim()
  if (trimmed) next.name = trimmed
  else delete next.name
  const bodyTrimmed = body.replace(/^\s*\n/, '')
  const content = Object.keys(next).length
    ? `---\n${stringifyYaml(next).trimEnd()}\n---\n\n${bodyTrimmed}`
    : bodyTrimmed
  const res = await commitAndPush({
    dir: ctx.worktreeDir, relPath: path, content, branch: ctx.branch, ...authorOf(author),
    message: `osnova: nazwa wyświetlana ${path}`, detectConflict: true,
  })
  audit(ctx, 'properties-changed', { path, detail: res.commit.slice(0, 8) })
  return res
}

function requireHistory(ctx: WorkspaceContext): void {
  if (!hasPermission(ctx.permissions, 'history-view', ctx.isSystemAdmin)) throw new AccessDenied('No history permission')
}

export async function getHistory(ctx: WorkspaceContext, path: string) {
  requireHistory(ctx)
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  return fileHistory(ctx.worktreeDir, path)
}

export async function getDocumentAtRevision(ctx: WorkspaceContext, path: string, rev: string): Promise<DocumentResult> {
  requireHistory(ctx)
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  let content: string
  try {
    content = await fileAtRevision(ctx.worktreeDir, rev, path)
  } catch {
    throw new NotFound(`Revision/file not found: ${rev}:${path}`)
  }
  if (MD_RE.test(path)) {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
    const assetBase = `/api/ws/${ctx.workspaceId}/file?view=${ctx.view}&path=${encodeURIComponent(dir)}`
    const { meta, body } = extractFrontmatter(content)
    const prefix = ctx.showMetadata && meta ? renderMetadataTable(meta) : ''
    return { kind: 'markdown', html: prefix + (await renderMarkdown(body, { assetBase })) }
  }
  return { kind: 'binary', data: Buffer.from(content), contentType: 'text/plain' }
}

export async function getBlame(ctx: WorkspaceContext, path: string) {
  requireHistory(ctx)
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  return blame(ctx.worktreeDir, path)
}

export async function getDiff(ctx: WorkspaceContext, path: string, base: string, head?: string): Promise<FileDiff> {
  requireHistory(ctx)
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  try {
    const raw = await fileDiff(ctx.worktreeDir, path, base, head || 'HEAD')
    return parseUnifiedDiff(raw)
  } catch (e) {
    throw new NotFound(`Diff failed: ${String((e as Error).message)}`)
  }
}


export interface SearchHit { path: string; snippet: string }

const TEXTUAL = /\.(md|markdown|txt|ya?ml|json|adr)$/i

export async function searchWorkspace(ctx: WorkspaceContext, q: string, limit = 30, maxScan = 1000): Promise<SearchHit[]> {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const files = await getTree(ctx) // już przefiltrowane wg widoku (fail-closed)
  const results: SearchHit[] = []
  let scanned = 0
  for (const path of files) {
    if (results.length >= limit || scanned >= maxScan) break
    scanned++
    let hit = path.toLowerCase().includes(query)
    let snippet = ''
    if (TEXTUAL.test(path)) {
      try {
        const c = (await readRepoFile(ctx.worktreeDir, path)).toString('utf8')
        const idx = c.toLowerCase().indexOf(query)
        if (idx !== -1) {
          hit = true
          snippet = c.slice(Math.max(0, idx - 35), idx + 75).replace(/\s+/g, ' ').trim()
        }
      } catch {
        /* pomiń nieczytelne */
      }
    }
    if (hit) results.push({ path, snippet })
  }
  return results
}


const MD_ONLY = /\.(md|markdown)$/i

async function tagsOf(ctx: WorkspaceContext, path: string): Promise<string[]> {
  if (!MD_ONLY.test(path)) return []
  try {
    const c = (await readRepoFile(ctx.worktreeDir, path)).toString('utf8')
    return extractTags(parseFrontmatter(c))
  } catch {
    return []
  }
}

export async function listTags(ctx: WorkspaceContext, maxScan = 1000): Promise<{ tag: string; count: number }[]> {
  const files = await getTree(ctx)
  const counts = new Map<string, number>()
  let scanned = 0
  for (const path of files) {
    if (scanned >= maxScan) break
    scanned++
    for (const tag of await tagsOf(ctx, path)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export async function getFilesByTag(ctx: WorkspaceContext, tag: string, maxScan = 1000): Promise<string[]> {
  const files = await getTree(ctx)
  const out: string[] = []
  let scanned = 0
  for (const path of files) {
    if (scanned >= maxScan) break
    scanned++
    if ((await tagsOf(ctx, path)).includes(tag)) out.push(path)
  }
  return out
}


export async function getDocsConfig(ctx: WorkspaceContext) {
  try {
    const raw = await readRepoFile(ctx.worktreeDir, '.docs.config.yaml')
    return parseDocsSections(raw.toString('utf8'))
  } catch {
    return null
  }
}

export async function getDocsNodes(ctx: WorkspaceContext, files?: string[]): Promise<TreeNode[]> {
  const list = files ?? (await getTree(ctx))
  const cfg = await getDocsConfig(ctx)
  return buildDocsTree(list, cfg)
}
