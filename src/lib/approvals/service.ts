import type { Payload } from 'payload'
import { stringify as stringifyYaml } from 'yaml'
import { isReadable } from '../content-access'
import { commitAndPush, fileRevision, readRepoFile } from '../git/worktree'
import { extractFrontmatter } from '../markdown/render'
import { canApprove } from '../roles'
import { AccessDenied, type WorkspaceContext } from '../read-service'

export type ApprovalStatus = 'approved' | 'changes_requested'

export interface Approver { id: string | number; name?: string | null; email: string }

export interface ApprovalState {
  status: ApprovalStatus | null
  revision: string | null
  note: string | null
  authorName: string | null
  authorEmail: string | null
  createdAt: string | null
  currentRevision: string | null
  stale: boolean // dokument zmienił się od czasu akceptacji
  canApprove: boolean
}

// Stempel akceptacji trzymany w froncie pliku (źródło prawdy; baza to przebudowywalny cache).
export interface ApprovalStamp {
  status: ApprovalStatus
  by: string | null
  name: string | null
  date: string | null
  note: string | null
}

function wsNum(ctx: WorkspaceContext): number | string {
  return /^\d+$/.test(String(ctx.workspaceId)) ? Number(ctx.workspaceId) : ctx.workspaceId
}

// Odczyt bloku `approval` z metadanych frontmattera. Akceptujemy łagodnie różne kształty.
export function readApprovalStamp(meta: Record<string, unknown> | null | undefined): ApprovalStamp | null {
  const raw = meta?.['approval']
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const status = a.status === 'approved' || a.status === 'changes_requested' ? a.status : null
  if (!status) return null
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return { status, by: str(a.by), name: str(a.name), date: str(a.date), note: str(a.note) }
}

// Zapis stempla akceptacji do frontmattera (commit + push). Część akcji „zatwierdź" —
// nie wymaga props-edit (uprawnienie approve zostało już sprawdzone przez wywołującego).
async function writeApprovalStamp(ctx: WorkspaceContext, path: string, stamp: ApprovalStamp, author: Approver): Promise<{ commit: string }> {
  const data = await readRepoFile(ctx.worktreeDir, path)
  const { meta, body } = extractFrontmatter(data.toString('utf8'))
  const next: Record<string, unknown> = { ...(meta ?? {}) }
  const block: Record<string, unknown> = { status: stamp.status }
  if (stamp.by) block.by = stamp.by
  if (stamp.name) block.name = stamp.name
  if (stamp.date) block.date = stamp.date
  if (stamp.note) block.note = stamp.note
  next.approval = block
  const bodyTrimmed = body.replace(/^\s*\n/, '')
  const content = `---\n${stringifyYaml(next).trimEnd()}\n---\n\n${bodyTrimmed}`
  return commitAndPush({
    dir: ctx.worktreeDir, relPath: path, content, branch: ctx.branch,
    authorName: author.name || author.email, authorEmail: author.email,
    message: `osnova: ${stamp.status === 'approved' ? 'akceptacja' : 'zmiany'} ${path}`,
    detectConflict: true,
  })
}

async function latestRow(payload: Payload, ctx: WorkspaceContext, path: string): Promise<any | null> {
  const res = await payload.find({
    collection: 'approvals',
    where: { and: [{ workspace: { equals: ctx.workspaceId } }, { path: { equals: path } }] },
    sort: '-createdAt', limit: 1, overrideAccess: true,
  })
  return (res.docs[0] as any) ?? null
}

export async function getApproval(payload: Payload, ctx: WorkspaceContext, path: string): Promise<ApprovalState> {
  if (!isReadable(path, ctx.rules)) throw new AccessDenied('Path outside view')
  // źródło prawdy: stempel we frontmatterze; baza jako uzupełnienie (rewizja do wykrycia „stale")
  let stamp: ApprovalStamp | null = null
  try {
    const data = await readRepoFile(ctx.worktreeDir, path)
    stamp = readApprovalStamp(extractFrontmatter(data.toString('utf8')).meta)
  } catch { stamp = null }
  const row = await latestRow(payload, ctx, path)
  let cur: string | null = null
  try { cur = await fileRevision(ctx.worktreeDir, path) } catch { cur = null }
  const canApp = canApprove(ctx.permissions, ctx.isSystemAdmin)

  const status = (stamp?.status ?? row?.status ?? null) as ApprovalStatus | null
  if (!status) {
    return { status: null, revision: null, note: null, authorName: null, authorEmail: null, createdAt: null, currentRevision: cur, stale: false, canApprove: canApp }
  }
  const approvedRevision = (row?.revision ?? null) as string | null
  return {
    status,
    revision: approvedRevision,
    note: stamp?.note ?? row?.note ?? null,
    authorName: stamp?.name ?? row?.authorName ?? null,
    authorEmail: stamp?.by ?? row?.authorEmail ?? null,
    createdAt: stamp?.date ?? row?.createdAt ?? null,
    currentRevision: cur,
    // „stale" gdy plik dostał commit po commicie zatwierdzającym (rewizja w bazie)
    stale: Boolean(cur && approvedRevision && approvedRevision !== cur),
    canApprove: canApp,
  }
}

async function notifyApproval(payload: Payload, ctx: WorkspaceContext, user: Approver, path: string, status: ApprovalStatus, note: string | undefined): Promise<void> {
  const members = await payload.find({ collection: 'memberships', where: { workspace: { equals: ctx.workspaceId } }, depth: 1, limit: 200, overrideAccess: true })
  // typ niesie czasownik (tłumaczony w dzwonku per-język); ewentualna uwaga trafia do excerpt
  const type = status === 'approved' ? 'approval_approved' : 'approval_changes'
  const excerpt = status === 'changes_requested' ? (note?.trim()?.slice(0, 160) || undefined) : undefined
  const wsId = wsNum(ctx)
  const seen = new Set<string>()
  for (const m of members.docs as any[]) {
    const roles: string[] = m.roles ?? []
    const u = m.user
    const isSupplier = roles.includes('editor') || roles.includes('workspace_maintainer')
    if (!isSupplier || !u || typeof u !== 'object') continue
    if (String(u.id) === String(user.id) || seen.has(String(u.id))) continue
    seen.add(String(u.id))
    await payload.create({
      collection: 'notifications', overrideAccess: true,
      data: { recipient: u.id, type, workspace: wsId, view: ctx.view, path, actorName: user.name ?? undefined, actorEmail: user.email, excerpt, read: false } as any,
    })
  }
}

export async function setApproval(payload: Payload, ctx: WorkspaceContext, user: Approver, path: string, status: ApprovalStatus, note?: string): Promise<ApprovalState> {
  if (!canApprove(ctx.permissions, ctx.isSystemAdmin)) throw new AccessDenied('No approve permission')
  if (!isReadable(path, ctx.rules)) throw new AccessDenied('Path outside view')
  if (status !== 'approved' && status !== 'changes_requested') throw new AccessDenied('Invalid status')
  const stamp: ApprovalStamp = {
    status, by: user.email, name: user.name ?? null, date: new Date().toISOString(), note: note?.trim() || null,
  }
  // 1) zapis stempla do frontmattera (źródło prawdy) → SHA commita zatwierdzającego
  const { commit } = await writeApprovalStamp(ctx, path, stamp, user)
  // 2) lustro w bazie (cache: szybkie zapytania + oś czasu + wykrycie „stale")
  await payload.create({
    collection: 'approvals', overrideAccess: true,
    data: { workspace: wsNum(ctx), path, revision: commit, status, note: note?.trim() || undefined, authorSub: String(user.id), authorName: user.name ?? undefined, authorEmail: user.email } as any,
  })
  try { await notifyApproval(payload, ctx, user, path, status, note) } catch { /* powiadomienia nie blokują akceptacji */ }
  return getApproval(payload, ctx, path)
}

// Uzgodnienie bazy ze stemplami w plikach (frontmatter = źródło prawdy). Tworzy brakujący
// wpis w bazie, gdy stempel istnieje, a najnowszy wiersz różni się statusem/datą. Cichy best-effort.
export async function reconcileApprovals(
  payload: Payload,
  ctx: WorkspaceContext,
  entries: { path: string; stamp: ApprovalStamp; revision: string | null }[],
): Promise<number> {
  let upserts = 0
  for (const { path, stamp, revision } of entries) {
    try {
      const row = await latestRow(payload, ctx, path)
      const same = row && row.status === stamp.status && (row.authorEmail ?? null) === (stamp.by ?? null) &&
        (revision == null || row.revision === revision)
      if (same) continue
      await payload.create({
        collection: 'approvals', overrideAccess: true,
        data: { workspace: wsNum(ctx), path, revision: revision ?? undefined, status: stamp.status, note: stamp.note ?? undefined, authorSub: 'reconcile', authorName: stamp.name ?? undefined, authorEmail: stamp.by ?? undefined } as any,
      })
      upserts++
    } catch { /* uzgodnienie nie może wywrócić budowy indeksu */ }
  }
  return upserts
}
