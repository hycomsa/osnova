import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { getWorkspaceContext } from '@/lib/read-service'
import {
  ALL_PERMISSIONS, ALL_VIEWS, MANAGEABLE_PERMISSIONS, WORKSPACE_ROLES,
  effectivePermissions, effectiveViews, hasPermission, isClientOnly,
  type Permission, type ViewName, type WorkspaceRole,
} from '@/lib/roles'

// role, które opiekun (nie system-admin) może nadawać (bez eskalacji do opiekuna/admina)
const MAINTAINER_ASSIGNABLE_ROLES: WorkspaceRole[] = ['editor', 'client_technical', 'client_business', 'viewer']

const onlyKnown = <T,>(vals: unknown, allowed: readonly T[]): T[] =>
  (Array.isArray(vals) ? vals : []).filter((v): v is T => (allowed as readonly unknown[]).includes(v))

async function gate(req: NextRequest, id: string) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return { err: NextResponse.json({ error: 'Invalid view' }, { status: 400 }) }
  const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
  return { payload, user, ctx }
}

// GET — lista członków. Dla zwykłego członka: lekka lista (wzmianki). Dla ws-admina/system-admina:
// pełne dane (role + nadpisania + uprawnienia/widoki efektywne) do ekranu zarządzania.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await gate(req, id)
    if ('err' in r) return r.err
    const { payload, ctx } = r
    const res = await payload.find({
      collection: 'memberships', where: { workspace: { equals: ctx.workspaceId } },
      depth: 1, limit: 500, overrideAccess: true,
    })
    const canManage = hasPermission(ctx.permissions, 'ws-admin', ctx.isSystemAdmin)
    const seen = new Set<string>()
    const members: any[] = []
    for (const m of res.docs as any[]) {
      const u = m.user
      if (!u || typeof u !== 'object' || !u.email) continue
      const key = String(u.id)
      if (seen.has(key)) continue
      seen.add(key)
      const base = { id: u.id, name: u.name ?? null, email: u.email, handle: String(u.email).split('@')[0] }
      if (!canManage) { members.push(base); continue }
      const roles = (m.roles ?? []) as WorkspaceRole[]
      const granted = (m.grantedPermissions ?? []) as Permission[]
      const revoked = (m.revokedPermissions ?? []) as Permission[]
      const viewAccess = (m.viewAccess ?? []) as ViewName[]
      members.push({
        ...base, roles, grantedPermissions: granted, revokedPermissions: revoked, viewAccess,
        effectivePermissions: effectivePermissions(roles, granted, revoked, false),
        effectiveViews: effectiveViews(roles, viewAccess.length ? viewAccess : undefined, false),
      })
    }
    members.sort((a, b) => (a.name ?? a.handle).localeCompare(b.name ?? b.handle))
    return NextResponse.json({ members, canManage, allRoles: WORKSPACE_ROLES, manageablePermissions: MANAGEABLE_PERMISSIONS, allPermissions: ALL_PERMISSIONS, allViews: ALL_VIEWS })
  } catch (e) { return toErrorResponse(e) }
}

// POST — dodaj/zmień członka (upsert po workspace+user) z nadpisaniami uprawnień.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  try {
    const r = await gate(req, id)
    if ('err' in r) return r.err
    const { payload, user, ctx } = r
    if (!hasPermission(ctx.permissions, 'ws-admin', ctx.isSystemAdmin)) return NextResponse.json({ error: 'Brak uprawnień do zarządzania członkami.' }, { status: 403 })

    const targetUser = body.userId
    if (!targetUser) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    let roles = onlyKnown<WorkspaceRole>(body.roles, WORKSPACE_ROLES)
    let granted = onlyKnown<Permission>(body.grantedPermissions, ALL_PERMISSIONS)
    let revoked = onlyKnown<Permission>(body.revokedPermissions, ALL_PERMISSIONS)
    let viewAccess = onlyKnown<ViewName>(body.viewAccess, ALL_VIEWS)
    if (roles.length === 0) return NextResponse.json({ error: 'Co najmniej jedna rola jest wymagana.' }, { status: 400 })

    // Guardraile dla opiekuna (nie system-admina)
    const maintainerOnly = !ctx.isSystemAdmin
    if (maintainerOnly) {
      if (roles.some((r2) => !MAINTAINER_ASSIGNABLE_ROLES.includes(r2)))
        return NextResponse.json({ error: 'Opiekun nie może nadać roli opiekuna workspace.' }, { status: 403 })
      const bad = [...granted, ...revoked].some((p) => !MANAGEABLE_PERMISSIONS.includes(p))
      if (bad) return NextResponse.json({ error: 'Opiekun może nadawać/odbierać tylko uprawnienia operacyjne.' }, { status: 403 })
    }
    // Twarda reguła PRD: role klienckie nigdy nie dostają widoku bezpośredniego
    if (isClientOnly(roles)) viewAccess = viewAccess.filter((v) => v !== 'direct')

    // user/workspace to relacje do kolekcji o całkowitych id — koercja na liczbę jest wymagana,
    // bo walidacja relacji (sprawdzenie istnienia) z wartością tekstową „4" nie trafia w rekord
    // i Payload zgłasza „pole nieprawidłowe: Użytkownik" (workspace był już koercjonowany — user nie).
    const targetUserId = Number(targetUser)
    if (!Number.isInteger(targetUserId)) return NextResponse.json({ error: 'Nieprawidłowy userId' }, { status: 400 })
    const existing = await payload.find({
      collection: 'memberships',
      where: { and: [{ workspace: { equals: Number(ctx.workspaceId) } }, { user: { equals: targetUserId } }] },
      limit: 1, overrideAccess: true,
    })
    const data = { workspace: Number(ctx.workspaceId), user: targetUserId, roles, grantedPermissions: granted, revokedPermissions: revoked, viewAccess } as any
    if (existing.docs[0]) await payload.update({ collection: 'memberships', id: (existing.docs[0] as any).id, data, overrideAccess: true })
    else await payload.create({ collection: 'memberships', data, overrideAccess: true })
    void user
    return NextResponse.json({ ok: true })
  } catch (e) { return toErrorResponse(e) }
}

// DELETE ?userId= — usuń członka. Nie można usunąć samego siebie (ochrona przed zablokowaniem).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const targetUser = req.nextUrl.searchParams.get('userId')
  if (!targetUser) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  try {
    const r = await gate(req, id)
    if ('err' in r) return r.err
    const { payload, user, ctx } = r
    if (!hasPermission(ctx.permissions, 'ws-admin', ctx.isSystemAdmin)) return NextResponse.json({ error: 'Brak uprawnień.' }, { status: 403 })
    if (String(targetUser) === String(user.id)) return NextResponse.json({ error: 'Nie możesz usunąć własnego członkostwa.' }, { status: 400 })
    const existing = await payload.find({
      collection: 'memberships',
      where: { and: [{ workspace: { equals: Number(ctx.workspaceId) } }, { user: { equals: Number(targetUser) } }] },
      limit: 1, overrideAccess: true,
    })
    if (existing.docs[0]) await payload.delete({ collection: 'memberships', id: (existing.docs[0] as any).id, overrideAccess: true })
    return NextResponse.json({ ok: true })
  } catch (e) { return toErrorResponse(e) }
}
