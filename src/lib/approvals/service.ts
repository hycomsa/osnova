import type { Payload } from 'payload'
import { isReadable } from '../content-access'
import { fileRevision } from '../git/worktree'
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

function wsNum(ctx: WorkspaceContext): number | string {
  return /^\d+$/.test(String(ctx.workspaceId)) ? Number(ctx.workspaceId) : ctx.workspaceId
}

export async function getApproval(payload: Payload, ctx: WorkspaceContext, path: string): Promise<ApprovalState> {
  if (!isReadable(path, ctx.rules)) throw new AccessDenied('Path outside view')
  const res = await payload.find({
    collection: 'approvals',
    where: { and: [{ workspace: { equals: ctx.workspaceId } }, { path: { equals: path } }] },
    sort: '-createdAt', limit: 1, overrideAccess: true,
  })
  let cur: string | null = null
  try { cur = await fileRevision(ctx.worktreeDir, path) } catch { cur = null }
  const canApp = canApprove(ctx.permissions, ctx.isSystemAdmin)
  const latest = res.docs[0] as any
  if (!latest) {
    return { status: null, revision: null, note: null, authorName: null, authorEmail: null, createdAt: null, currentRevision: cur, stale: false, canApprove: canApp }
  }
  return {
    status: latest.status ?? null,
    revision: latest.revision ?? null,
    note: latest.note ?? null,
    authorName: latest.authorName ?? null,
    authorEmail: latest.authorEmail ?? null,
    createdAt: latest.createdAt ?? null,
    currentRevision: cur,
    stale: Boolean(cur && latest.revision && latest.revision !== cur),
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
  let cur: string | undefined
  try { cur = (await fileRevision(ctx.worktreeDir, path)) ?? undefined } catch { cur = undefined }
  await payload.create({
    collection: 'approvals', overrideAccess: true,
    data: { workspace: wsNum(ctx), path, revision: cur, status, note: note?.trim() || undefined, authorSub: String(user.id), authorName: user.name ?? undefined, authorEmail: user.email } as any,
  })
  try { await notifyApproval(payload, ctx, user, path, status, note) } catch { /* powiadomienia nie blokują akceptacji */ }
  return getApproval(payload, ctx, path)
}
