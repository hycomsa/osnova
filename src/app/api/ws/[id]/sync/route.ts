import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { resolveWorkspace } from '@/lib/read-service'
import { enqueueRepoSync, latestRepoSyncStatus } from '@/lib/jobs'
import { effectivePermissions, hasPermission, type Permission, type WorkspaceRole } from '@/lib/roles'

// Lekka bramka ws-admin BEZ klonowania worktree (getWorkspaceContext klonowałby synchronicznie,
// co przeczy idei zadania w tle). Czyta tylko członkostwo + role.
async function gateWsAdmin(req: NextRequest, id: string) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const isSystemAdmin = (user.globalRoles ?? []).includes('system_admin')
  const ws = await resolveWorkspace(payload, id)
  const workspaceId = String(ws.id)
  let perms: Permission[] = []
  if (!isSystemAdmin) {
    const ms = await payload.find({
      collection: 'memberships',
      where: { and: [{ workspace: { equals: workspaceId } }, { user: { equals: user.id } }] },
      limit: 1, overrideAccess: true,
    })
    const m = ms.docs[0] as any
    const roles = (m?.roles ?? []) as WorkspaceRole[]
    perms = effectivePermissions(roles, (m?.grantedPermissions ?? []) as Permission[], (m?.revokedPermissions ?? []) as Permission[], false)
  }
  if (!hasPermission(perms, 'ws-admin', isSystemAdmin)) return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { payload, workspaceId }
}

// POST — zakolejkuj synchronizację (klon/odświeżenie) repo workspace'u.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await gateWsAdmin(req, id)
    if ('err' in r) return r.err
    const jobId = await enqueueRepoSync(r.payload, r.workspaceId)
    return NextResponse.json({ ok: true, jobId })
  } catch (e) {
    return toErrorResponse(e)
  }
}

// GET — status ostatniej synchronizacji (do pollingu paska postępu w UI).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await gateWsAdmin(req, id)
    if ('err' in r) return r.err
    return NextResponse.json({ status: await latestRepoSyncStatus(r.payload, r.workspaceId) })
  } catch (e) {
    return toErrorResponse(e)
  }
}
