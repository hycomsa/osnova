import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { getApproval, setApproval } from '@/lib/approvals/service'
import { AccessDenied } from '@/lib/read-service'
import type { WorkspaceContext } from '@/lib/read-service'
import { effectivePermissions, type WorkspaceRole } from '@/lib/roles'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'osnova-ap-')) })

function ctx(roles: WorkspaceRole[], isSystemAdmin = false): WorkspaceContext {
  return { workspaceId: 'w1', view: 'direct', rules: { include: ['**'], exclude: [] }, worktreeDir: dir, branch: 'main', roles, permissions: effectivePermissions(roles, [], [], isSystemAdmin), isSystemAdmin, showMetadata: false, allowedViews: [], payload: {} as any, userId: 'u1' }
}
function stub() {
  const created: any[] = []
  let seq = 0
  return {
    created,
    payload: {
      create: async ({ collection, data }: any) => { const d = { id: ++seq, collection, createdAt: new Date(2026, 0, seq).toISOString(), ...data }; created.push(d); return d },
      find: async ({ collection }: any) => {
        if (collection === 'approvals') return { docs: created.filter((c) => c.collection === 'approvals').reverse() }
        return { docs: [] } // memberships itd.
      },
    } as any,
  }
}

describe('approvals service', () => {
  it('client_business może zatwierdzić — zwraca status approved', async () => {
    const { payload } = stub()
    const st = await setApproval(payload, ctx(['client_business']), { id: 'u1', email: 'c@x.pl', name: 'Klient' }, 'a.md', 'approved')
    expect(st.status).toBe('approved')
    expect(st.canApprove).toBe(true)
  })
  it('client_technical: poproś o zmiany z uwagą', async () => {
    const { payload } = stub()
    const st = await setApproval(payload, ctx(['client_technical']), { id: 'u2', email: 't@x.pl' }, 'a.md', 'changes_requested', 'popraw sekcję 2')
    expect(st.status).toBe('changes_requested')
    expect(st.note).toBe('popraw sekcję 2')
  })
  it('editor nie ma uprawnienia approve → AccessDenied', async () => {
    const { payload } = stub()
    await expect(setApproval(payload, ctx(['editor']), { id: 'e', email: 'e@x.pl' }, 'a.md', 'approved')).rejects.toBeInstanceOf(AccessDenied)
  })
  it('viewer → AccessDenied', async () => {
    const { payload } = stub()
    await expect(setApproval(payload, ctx(['viewer']), { id: 'v', email: 'v@x.pl' }, 'a.md', 'approved')).rejects.toBeInstanceOf(AccessDenied)
  })
  it('getApproval zwraca najnowszą akceptację', async () => {
    const { payload } = stub()
    await setApproval(payload, ctx(['client_business']), { id: 'u1', email: 'c@x.pl' }, 'a.md', 'approved')
    await setApproval(payload, ctx(['client_business']), { id: 'u1', email: 'c@x.pl' }, 'a.md', 'changes_requested', 'jednak nie')
    const st = await getApproval(payload, ctx(['client_business']), 'a.md')
    expect(st.status).toBe('changes_requested')
    expect(st.note).toBe('jednak nie')
  })
  it('getApproval bez akceptacji → status null, ale canApprove wg roli', async () => {
    const { payload } = stub()
    const st = await getApproval(payload, ctx(['viewer']), 'a.md')
    expect(st.status).toBe(null)
    expect(st.canApprove).toBe(false)
  })
})
