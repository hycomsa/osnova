import type { Payload } from 'payload'
import { isPathAllowed } from '../content-access'
import { currentRevision } from '../git/worktree'
import { hashContext } from './anchor'
import { AccessDenied, NotFound, type WorkspaceContext } from '../read-service'
import { hasPermission } from '../roles'

export interface CommentAuthor {
  id: string | number
  name?: string | null
  email: string
}

export interface CreateCommentInput {
  path: string
  kind: 'inline' | 'document'
  body: string
  quote?: string
  prefix?: string
  suffix?: string
  contextHash?: string
  parent?: string | number | null
}

function wsId(doc: any): string {
  const w = doc?.workspace
  return String(typeof w === 'object' && w ? w.id : w)
}

export async function listComments(payload: Payload, ctx: WorkspaceContext, path: string): Promise<any[]> {
  if (!isPathAllowed(path, ctx.rules)) throw new AccessDenied('Path outside view')
  const res = await payload.find({
    collection: 'comments',
    where: { and: [{ workspace: { equals: ctx.workspaceId } }, { path: { equals: path } }] },
    sort: 'createdAt',
    limit: 500,
    overrideAccess: true,
  })
  return res.docs
}

// wyłuskaj uchwyty @wzmianek z treści komentarza (handle = część e-maila przed @)
export function extractMentionHandles(body: string): string[] {
  return [...new Set([...body.matchAll(/(?:^|\s)@([\w.-]+)/g)].map((m) => m[1]))]
}

function wsNum(ctx: WorkspaceContext): number | string {
  return /^\d+$/.test(String(ctx.workspaceId)) ? Number(ctx.workspaceId) : ctx.workspaceId
}

async function createNotification(payload: Payload, ctx: WorkspaceContext, user: CommentAuthor, comment: any, recipient: number | string, type: 'mention' | 'reply'): Promise<void> {
  await payload.create({
    collection: 'notifications',
    overrideAccess: true,
    data: {
      recipient,
      type,
      workspace: wsNum(ctx),
      view: ctx.view,
      path: comment.path,
      commentId: String(comment.id),
      actorName: user.name ?? undefined,
      actorEmail: user.email,
      excerpt: String(comment.body ?? '').slice(0, 160),
      read: false,
    } as any,
  })
}

// utwórz powiadomienia dla wspomnianych członków workspace (poza autorem); zwraca id powiadomionych
async function notifyMentions(payload: Payload, ctx: WorkspaceContext, user: CommentAuthor, comment: any): Promise<Set<string>> {
  const targets = new Set<string>()
  const handles = extractMentionHandles(String(comment.body ?? ''))
  if (handles.length === 0) return targets
  const members = await payload.find({
    collection: 'memberships',
    where: { workspace: { equals: ctx.workspaceId } },
    depth: 1, limit: 200, overrideAccess: true,
  })
  const byHandle = new Map<string, any>()
  for (const m of members.docs as any[]) {
    const u = m.user
    if (u && typeof u === 'object' && u.email) byHandle.set(String(u.email).split('@')[0], u)
  }
  for (const h of handles) {
    const u = byHandle.get(h)
    if (!u || String(u.id) === String(user.id) || targets.has(String(u.id))) continue
    targets.add(String(u.id))
    await createNotification(payload, ctx, user, comment, u.id, 'mention')
  }
  return targets
}

// powiadom uczestników wątku (autora rodzica + innych odpowiadających) o nowej odpowiedzi
async function notifyThreadReply(payload: Payload, ctx: WorkspaceContext, user: CommentAuthor, comment: any, alreadyNotified: Set<string>): Promise<void> {
  const parentRef = comment.parent
  if (!parentRef) return
  const parentId = typeof parentRef === 'object' && parentRef ? parentRef.id : parentRef
  const parent = await payload.findByID({ collection: 'comments', id: parentId, overrideAccess: true }).catch(() => null)
  if (!parent) return
  const replies = await payload.find({ collection: 'comments', where: { parent: { equals: parentId } }, limit: 300, overrideAccess: true })
  // authorSub przechowuje String(user.id) — to id użytkownika
  const participants = new Set<string>([String((parent as any).authorSub), ...(replies.docs as any[]).map((r) => String(r.authorSub))])
  participants.delete(String(user.id)) // nie powiadamiaj siebie
  for (const sub of participants) {
    if (!sub || sub === 'undefined' || alreadyNotified.has(sub)) continue // wzmianka ma pierwszeństwo
    const rid = /^\d+$/.test(sub) ? Number(sub) : sub
    await createNotification(payload, ctx, user, comment, rid, 'reply')
  }
}

export async function createComment(
  payload: Payload,
  ctx: WorkspaceContext,
  user: CommentAuthor,
  input: CreateCommentInput,
): Promise<any> {
  if (!hasPermission(ctx.permissions, 'comment', ctx.isSystemAdmin)) throw new AccessDenied('No comment permission')
  if (!isPathAllowed(input.path, ctx.rules)) throw new AccessDenied('Path outside view')
  if (!input.body?.trim()) throw new AccessDenied('Empty comment')
  let revision: string | undefined
  try {
    revision = await currentRevision(ctx.worktreeDir)
  } catch {
    revision = undefined
  }
  const doc = await payload.create({
    collection: 'comments',
    overrideAccess: true,
    data: {
      workspace: /^\d+$/.test(String(ctx.workspaceId)) ? Number(ctx.workspaceId) : ctx.workspaceId,
      path: input.path,
      kind: input.kind,
      body: input.body,
      quote: input.quote,
      prefix: input.prefix,
      suffix: input.suffix,
      contextHash: input.quote ? hashContext(input.prefix ?? '', input.quote, input.suffix ?? '') : undefined,
      revision,
      parent: input.parent ?? undefined,
      status: 'open',
      authorSub: String(user.id),
      authorName: user.name ?? undefined,
      authorEmail: user.email,
    } as any,
  })
  // powiadomienia (@wzmianki + odpowiedzi w wątku) — nie blokują utworzenia komentarza przy błędzie
  try {
    const mentioned = await notifyMentions(payload, ctx, user, doc)
    await notifyThreadReply(payload, ctx, user, doc, mentioned)
  } catch { /* ignore */ }
  return doc
}

export async function setStatus(
  payload: Payload, ctx: WorkspaceContext, _user: CommentAuthor, id: string | number, status: 'open' | 'resolved',
): Promise<any> {
  const c = await payload.findByID({ collection: 'comments', id, overrideAccess: true }).catch(() => null)
  if (!c || wsId(c) !== String(ctx.workspaceId)) throw new NotFound('Comment not found')
  if (!hasPermission(ctx.permissions, 'comment', ctx.isSystemAdmin)) throw new AccessDenied('No permission')
  return payload.update({ collection: 'comments', id, data: { status }, overrideAccess: true })
}

// Akceptacja komentarza do wcielenia przez AI — może oznaczać redaktor (prawo edycji) lub ws-admin.
export async function setAccepted(
  payload: Payload, ctx: WorkspaceContext, _user: CommentAuthor, id: string | number, accepted: boolean,
): Promise<any> {
  const c = await payload.findByID({ collection: 'comments', id, overrideAccess: true }).catch(() => null)
  if (!c || wsId(c) !== String(ctx.workspaceId)) throw new NotFound('Comment not found')
  const canEditDocs = hasPermission(ctx.permissions, 'edit-wysiwyg', ctx.isSystemAdmin) || hasPermission(ctx.permissions, 'edit-raw', ctx.isSystemAdmin)
  if (!canEditDocs && !hasPermission(ctx.permissions, 'ws-admin', ctx.isSystemAdmin)) throw new AccessDenied('No permission to accept comments')
  return payload.update({ collection: 'comments', id, data: { accepted } as any, overrideAccess: true })
}

export const REACTIONS = ['👍', '✅', '❓', '🎯', '🚀'] as const

export async function toggleReaction(
  payload: Payload, ctx: WorkspaceContext, user: CommentAuthor, id: string | number, emoji: string,
): Promise<any> {
  if (!hasPermission(ctx.permissions, 'comment', ctx.isSystemAdmin)) throw new AccessDenied('No permission')
  if (!(REACTIONS as readonly string[]).includes(emoji)) throw new AccessDenied('Invalid reaction')
  const c = await payload.findByID({ collection: 'comments', id, overrideAccess: true }).catch(() => null)
  if (!c || wsId(c) !== String(ctx.workspaceId)) throw new NotFound('Comment not found')
  const sub = String(user.id)
  const current: { emoji: string; authorSub: string }[] = ((c as any).reactions ?? []).map((r: any) => ({ emoji: r.emoji, authorSub: r.authorSub }))
  const idx = current.findIndex((r) => r.emoji === emoji && r.authorSub === sub)
  const next = idx >= 0 ? current.filter((_, i) => i !== idx) : [...current, { emoji, authorSub: sub }]
  return payload.update({ collection: 'comments', id, data: { reactions: next } as any, overrideAccess: true })
}

export async function deleteComment(
  payload: Payload, ctx: WorkspaceContext, user: CommentAuthor, id: string | number,
): Promise<{ ok: true }> {
  const c = await payload.findByID({ collection: 'comments', id, overrideAccess: true }).catch(() => null)
  if (!c || wsId(c) !== String(ctx.workspaceId)) throw new NotFound('Comment not found')
  const isAuthor = String((c as any).authorSub) === String(user.id)
  if (!isAuthor && !hasPermission(ctx.permissions, 'ws-admin', ctx.isSystemAdmin)) throw new AccessDenied('Not allowed')
  await payload.delete({ collection: 'comments', id, overrideAccess: true })
  return { ok: true }
}
