import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { getProperties, getWorkspaceContext, setDisplayName, setProperties } from '@/lib/read-service'
import { ALL_VIEWS, type ViewName } from '@/lib/roles'

// Właściwości/metadane dokumentu (frontmatter) — FR-21.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  const path = req.nextUrl.searchParams.get('path') ?? ''
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    return NextResponse.json(await getProperties(ctx, path))
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })

  let body: { path?: string; meta?: Record<string, unknown> }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.path || typeof body.meta !== 'object' || body.meta === null) {
    return NextResponse.json({ error: 'Missing path or meta' }, { status: 400 })
  }

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    const author = { name: user.name || user.email, email: user.email }
    const { commit } = await setProperties(ctx, body.path, body.meta, author)
    return NextResponse.json({ ok: true, commit })
  } catch (e) {
    return toErrorResponse(e)
  }
}

// Szybka zmiana nazwy wyświetlanej (frontmatter `name`) — merge, zachowuje resztę pól.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })

  let body: { path?: string; name?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    const author = { name: user.name || user.email, email: user.email }
    const { commit } = await setDisplayName(ctx, body.path, body.name ?? null, author)
    return NextResponse.json({ ok: true, commit })
  } catch (e) {
    return toErrorResponse(e)
  }
}
