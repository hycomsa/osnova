import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { cloneDefaultSkillsToWorkspace, skillsForPicker, workspaceSkillRows } from '@/lib/ai/skills-service'
import { toErrorResponse } from '@/lib/http'
import { getWorkspaceContext } from '@/lib/read-service'
import { ALL_VIEWS, hasPermission, type ViewName } from '@/lib/roles'

async function gate(req: NextRequest, id: string) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return { err: NextResponse.json({ error: 'Invalid view' }, { status: 400 }) }
  const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
  return { payload, ctx }
}
const isAdmin = (ctx: any) => hasPermission(ctx.permissions, 'ws-admin', ctx.isSystemAdmin)

// GET: ?manage=1 (ws-admin) → wszystkie rekordy workspace'u; inaczej → skille do wyboru (picker).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await gate(req, id); if ('err' in r) return r.err
    if (req.nextUrl.searchParams.get('manage') === '1') {
      if (!isAdmin(r.ctx)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const rows = await workspaceSkillRows(r.payload, r.ctx.workspaceId)
      return NextResponse.json({ skills: rows, manage: true })
    }
    return NextResponse.json({ skills: await skillsForPicker(r.payload, r.ctx.workspaceId) })
  } catch (e) { return toErrorResponse(e) }
}

const CATS = ['apply', 'refine']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await gate(req, id); if ('err' in r) return r.err
    if (!isAdmin(r.ctx)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    // import domyślnej puli (dla workspace'ów utworzonych zanim istniała ta funkcja)
    if (b.import === true) {
      await cloneDefaultSkillsToWorkspace(r.payload, r.ctx.workspaceId)
      return NextResponse.json({ ok: true, skills: await workspaceSkillRows(r.payload, r.ctx.workspaceId) })
    }
    if (!b.name || !b.instruction) return NextResponse.json({ error: 'Missing name/instruction' }, { status: 400 })
    const doc = await r.payload.create({ collection: 'ai-skills', overrideAccess: true, data: {
      workspace: Number(r.ctx.workspaceId) || r.ctx.workspaceId, key: String(b.key || b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'skill',
      name: String(b.name), description: String(b.description ?? ''), category: CATS.includes(b.category) ? b.category : 'apply',
      instruction: String(b.instruction), enabled: b.enabled !== false, builtin: false, sortOrder: Number(b.sortOrder ?? 100),
    } as any })
    return NextResponse.json({ ok: true, skill: doc })
  } catch (e) { return toErrorResponse(e) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await gate(req, id); if ('err' in r) return r.err
    if (!isAdmin(r.ctx)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    if (!b.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const cur = await r.payload.findByID({ collection: 'ai-skills', id: b.id, overrideAccess: true }).catch(() => null) as any
    if (!cur || String(typeof cur.workspace === 'object' ? cur.workspace?.id : cur.workspace) !== String(r.ctx.workspaceId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const data: any = {}
    for (const f of ['name', 'description', 'instruction']) if (typeof b[f] === 'string') data[f] = b[f]
    if (CATS.includes(b.category)) data.category = b.category
    if (typeof b.enabled === 'boolean') data.enabled = b.enabled
    const doc = await r.payload.update({ collection: 'ai-skills', id: b.id, data, overrideAccess: true })
    return NextResponse.json({ ok: true, skill: doc })
  } catch (e) { return toErrorResponse(e) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await gate(req, id); if ('err' in r) return r.err
    if (!isAdmin(r.ctx)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const sid = req.nextUrl.searchParams.get('id') ?? ''
    if (!sid) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const cur = await r.payload.findByID({ collection: 'ai-skills', id: sid, overrideAccess: true }).catch(() => null) as any
    if (!cur || String(typeof cur.workspace === 'object' ? cur.workspace?.id : cur.workspace) !== String(r.ctx.workspaceId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await r.payload.delete({ collection: 'ai-skills', id: sid, overrideAccess: true })
    return NextResponse.json({ ok: true })
  } catch (e) { return toErrorResponse(e) }
}
