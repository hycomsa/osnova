import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { getWorkspaceContext } from '@/lib/read-service'
import { isReadable } from '@/lib/content-access'
import { ALL_VIEWS, type ViewName } from '@/lib/roles'

// GET  /api/ws/[id]/favorites?view=  → ulubione bieżącego użytkownika (filtrowane do widocznych w widoku)
// POST { path, label } (?view=)      → dodaj do ulubionych (idempotentnie)
// DELETE ?view=&path=                → usuń z ulubionych
async function ctxFor(req: NextRequest, id: string, view: ViewName) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!ALL_VIEWS.includes(view)) return { err: NextResponse.json({ error: 'Invalid view' }, { status: 400 }) }
  const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
  return { payload, user, ctx }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  try {
    const r = await ctxFor(req, id, view)
    if ('err' in r) return r.err
    const { payload, user, ctx } = r
    const res = await payload.find({
      collection: 'favorites',
      where: { and: [{ workspace: { equals: Number(ctx.workspaceId) } }, { user: { equals: user.id } }] },
      sort: '-createdAt', limit: 200, overrideAccess: true,
    })
    const favorites = (res.docs as any[])
      .map((d) => ({ path: d.path as string, label: (d.label as string) ?? null }))
      .filter((f) => isReadable(f.path, ctx.rules)) // nie pokazuj ulubionych spoza bieżącego widoku
    return NextResponse.json({ favorites })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  let body: { path?: string; label?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const path = body.path?.trim()
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  try {
    const r = await ctxFor(req, id, view)
    if ('err' in r) return r.err
    const { payload, user, ctx } = r
    if (!isReadable(path, ctx.rules)) return NextResponse.json({ error: 'Path outside view' }, { status: 403 })
    const existing = await payload.find({
      collection: 'favorites',
      where: { and: [{ workspace: { equals: Number(ctx.workspaceId) } }, { user: { equals: user.id } }, { path: { equals: path } }] },
      limit: 1, overrideAccess: true,
    })
    if (existing.docs.length === 0) {
      await payload.create({
        collection: 'favorites', overrideAccess: true,
        data: { user: user.id, workspace: Number(ctx.workspaceId), view, path, label: body.label?.slice(0, 200) } as any,
      })
    }
    return NextResponse.json({ ok: true, starred: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  const path = req.nextUrl.searchParams.get('path')?.trim()
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  try {
    const r = await ctxFor(req, id, view)
    if ('err' in r) return r.err
    const { payload, user, ctx } = r
    const existing = await payload.find({
      collection: 'favorites',
      where: { and: [{ workspace: { equals: Number(ctx.workspaceId) } }, { user: { equals: user.id } }, { path: { equals: path } }] },
      limit: 1, overrideAccess: true,
    })
    if (existing.docs[0]) await payload.delete({ collection: 'favorites', id: (existing.docs[0] as any).id, overrideAccess: true })
    return NextResponse.json({ ok: true, starred: false })
  } catch (e) {
    return toErrorResponse(e)
  }
}
