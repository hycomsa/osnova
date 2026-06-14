import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { resolveWorkspace } from '@/lib/read-service'
import { effectivePermissions, hasPermission, type Permission, type WorkspaceRole } from '@/lib/roles'

// Lekkie „capabilities" workspace'u dla nagłówka (bez worktree/gita) — czego użytkownik
// może użyć: zarządzanie członkami, raporty. Używane przez kafelki w menu nawigacyjnym.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isSystemAdmin = (user.globalRoles ?? []).includes('system_admin')
  let ws
  try { ws = await resolveWorkspace(payload, id) } catch { return NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const ms = await payload.find({
    collection: 'memberships',
    where: { and: [{ workspace: { equals: String(ws.id) } }, { user: { equals: user.id } }] },
    limit: 1, overrideAccess: true,
  })
  const m = ms.docs[0] as any
  if (!isSystemAdmin && !m) return NextResponse.json({ canManageMembers: false, canViewReports: false })
  const perms = effectivePermissions(
    (m?.roles ?? []) as WorkspaceRole[],
    (m?.grantedPermissions ?? []) as Permission[],
    (m?.revokedPermissions ?? []) as Permission[],
    isSystemAdmin,
  )
  return NextResponse.json({
    canManageMembers: hasPermission(perms, 'ws-admin', isSystemAdmin),
    canViewReports: hasPermission(perms, 'reports-view', isSystemAdmin),
  })
}
