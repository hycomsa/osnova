import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setApproval } from '@/lib/approvals/service'
import { getWorkspaceContext } from '@/lib/read-service'
import { getReportsIndex } from '@/lib/reports'
import { makeBareOrigin, pushExternalChange } from './helpers/fixture-repo'

let bareDir: string
let seq = 0
let approvals: any[] = []
let createSeq = 0

function mkPayload(roles: string[]) {
  return {
    create: async ({ collection, data }: any) => {
      const d = { id: ++createSeq, collection, createdAt: new Date(2026, 0, createSeq).toISOString(), ...data }
      if (collection === 'approvals') approvals.push(d)
      return d
    },
    find: async ({ collection, where }: any) => {
      if (collection === 'workspaces') { const v = where?.id?.equals ?? where?.slug?.equals; return { docs: [{ id: v, slug: String(v), name: String(v) }] } }
      if (collection === 'memberships') return { docs: [{ roles }] }
      if (collection === 'repo-bindings') return { docs: [{ repoUrl: bareDir, branch: 'main', credentialRef: null }] }
      if (collection === 'view-configs') return { docs: [] }
      if (collection === 'approvals') {
        const path = where?.and?.[1]?.path?.equals
        return { docs: approvals.filter((a) => path == null || a.path === path).reverse() }
      }
      return { docs: [] }
    },
  } as any
}

beforeAll(async () => { process.env.WORKTREES_DIR = await mkdtemp(join(tmpdir(), 'osnova-ri-')) })
beforeEach(async () => { seq += 1; approvals = []; bareDir = (await makeBareOrigin()).bareDir })

describe('reports index', () => {
  it('reflects approval status and reconciles the DB from an out-of-band frontmatter stamp', async () => {
    const payload = mkPayload(['workspace_maintainer'])
    const wsId = `w${seq}`
    const mk = (forceFetch = false) => getWorkspaceContext({ payload, user: { id: 'm' }, workspaceId: wsId, view: 'direct', forceFetch })

    // approve doc.md through the app → stamp + DB row
    await setApproval(payload, await mk(), { id: 'm', email: 'm@x.pl', name: 'Maint' }, 'doc.md', 'approved')
    const idx1 = await getReportsIndex(payload, await mk(true))
    expect(idx1.docs.find((d) => d.path === 'doc.md')?.status).toBe('approved')

    // drift: wipe the DB mirror and push a NEW file that carries a stamp only in frontmatter
    approvals = []
    await pushExternalChange(bareDir, 'spec.md', '---\napproval:\n  status: approved\n  by: ext@x.pl\n  date: 2026-03-01T00:00:00Z\n---\n# Spec\n')
    const idx2 = await getReportsIndex(payload, await mk(true))

    const spec = idx2.docs.find((d) => d.path === 'spec.md')
    expect(spec?.status).toBe('approved') // raport czyta status z frontmattera
    expect(approvals.some((a) => a.path === 'spec.md')).toBe(true) // reconcile odtworzył wiersz w bazie
  })
})
