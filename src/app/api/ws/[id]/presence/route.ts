import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { type Activity, heartbeat, leave, presentOn } from '@/lib/presence'
import { resolveWorkspace } from '@/lib/read-service'

// Lekka bramka: tylko członek workspace'u (lub system-admin). Bez ensureWorktree/gita,
// bo heartbeat leci co ~10 s.
async function gate(req: NextRequest, id: string) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const isAdmin = (user.globalRoles ?? []).includes('system_admin')
  let ws
  try { ws = await resolveWorkspace(payload, id) } catch { return { err: NextResponse.json({ error: 'Not found' }, { status: 404 }) } }
  const wsId = String(ws.id)
  if (!isAdmin) {
    const ms = await payload.find({ collection: 'memberships', where: { and: [{ workspace: { equals: wsId } }, { user: { equals: user.id } }] }, limit: 1, overrideAccess: true })
    if (!ms.docs[0]) return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { wsId, user }
}

const ACT: Activity[] = ['viewing', 'editing', 'commenting']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await gate(req, id)
  if ('err' in r) return r.err
  let body: { path?: string; activity?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  const activity = (ACT.includes(body.activity as Activity) ? body.activity : 'viewing') as Activity
  const uid = String(r.user.id)
  heartbeat(r.wsId, body.path, { userId: uid, name: r.user.name, email: r.user.email }, activity)
  return NextResponse.json({ users: presentOn(r.wsId, body.path, uid) })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await gate(req, id)
  if ('err' in r) return r.err
  const path = req.nextUrl.searchParams.get('path') ?? ''
  if (path) leave(r.wsId, path, String(r.user.id))
  return NextResponse.json({ ok: true })
}
