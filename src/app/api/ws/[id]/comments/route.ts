import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { createComment, deleteComment, listComments, setAccepted, setStatus, toggleReaction } from '@/lib/comments/service'
import { toErrorResponse } from '@/lib/http'
import { getWorkspaceContext } from '@/lib/read-service'
import { ALL_VIEWS, hasPermission, type ViewName } from '@/lib/roles'

async function resolve(req: NextRequest, id: string) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return { error: NextResponse.json({ error: 'Invalid view' }, { status: 400 }) }
  return { payload, user, view }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await resolve(req, id)
  if ('error' in r) return r.error
  const path = req.nextUrl.searchParams.get('path') ?? ''
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  try {
    const ctx = await getWorkspaceContext({ payload: r.payload, user: r.user, workspaceId: id, view: r.view })
    const comments = await listComments(r.payload, ctx, path)
    return NextResponse.json({ comments, canComment: hasPermission(ctx.permissions, 'comment', ctx.isSystemAdmin) })
  } catch (e) { return toErrorResponse(e) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await resolve(req, id)
  if ('error' in r) return r.error
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.path || !body.body) return NextResponse.json({ error: 'Missing path or body' }, { status: 400 })
  try {
    const ctx = await getWorkspaceContext({ payload: r.payload, user: r.user, workspaceId: id, view: r.view })
    const author = { id: r.user.id, name: r.user.name, email: r.user.email }
    const doc = await createComment(r.payload, ctx, author, {
      path: body.path, kind: body.kind === 'inline' ? 'inline' : 'document', body: body.body,
      quote: body.quote, prefix: body.prefix, suffix: body.suffix, contextHash: body.contextHash, parent: body.parent ?? null,
    })
    return NextResponse.json({ ok: true, comment: doc })
  } catch (e) { return toErrorResponse(e) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await resolve(req, id)
  if ('error' in r) return r.error
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const isReaction = typeof body.reaction === 'string'
  const isAccept = typeof body.accepted === 'boolean'
  if (!isReaction && !isAccept && !['open', 'resolved'].includes(body.status)) return NextResponse.json({ error: 'Missing status/reaction/accepted' }, { status: 400 })
  try {
    const ctx = await getWorkspaceContext({ payload: r.payload, user: r.user, workspaceId: id, view: r.view })
    const author = { id: r.user.id, name: r.user.name, email: r.user.email }
    const doc = isReaction
      ? await toggleReaction(r.payload, ctx, author, body.id, body.reaction)
      : isAccept
        ? await setAccepted(r.payload, ctx, author, body.id, body.accepted)
        : await setStatus(r.payload, ctx, author, body.id, body.status)
    return NextResponse.json({ ok: true, comment: doc })
  } catch (e) { return toErrorResponse(e) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await resolve(req, id)
  if ('error' in r) return r.error
  const cid = req.nextUrl.searchParams.get('id') ?? ''
  if (!cid) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  try {
    const ctx = await getWorkspaceContext({ payload: r.payload, user: r.user, workspaceId: id, view: r.view })
    const author = { id: r.user.id, name: r.user.name, email: r.user.email }
    await deleteComment(r.payload, ctx, author, cid)
    return NextResponse.json({ ok: true })
  } catch (e) { return toErrorResponse(e) }
}
