import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { getApproval, setApproval } from '@/lib/approvals/service'
import { toErrorResponse } from '@/lib/http'
import { getWorkspaceContext } from '@/lib/read-service'
import { ALL_VIEWS, type ViewName } from '@/lib/roles'

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
    return NextResponse.json(await getApproval(r.payload, ctx, path))
  } catch (e) { return toErrorResponse(e) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await resolve(req, id)
  if ('error' in r) return r.error
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.path || !['approved', 'rejected', 'in_review'].includes(body.status)) {
    return NextResponse.json({ error: 'Missing path/status' }, { status: 400 })
  }
  try {
    const ctx = await getWorkspaceContext({ payload: r.payload, user: r.user, workspaceId: id, view: r.view })
    const author = { id: r.user.id, name: r.user.name, email: r.user.email }
    const state = await setApproval(r.payload, ctx, author, body.path, body.status, body.note)
    return NextResponse.json({ ok: true, ...state })
  } catch (e) { return toErrorResponse(e) }
}
