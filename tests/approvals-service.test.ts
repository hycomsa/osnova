import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureWorktree, listFiles, readRepoFile } from '@/lib/git/worktree'
import { getApproval, setApproval } from '@/lib/approvals/service'
import { AccessDenied, getWorkspaceContext } from '@/lib/read-service'
import { makeBareOrigin, pushExternalChange } from './helpers/fixture-repo'

let bareDir: string
let seq = 0
let approvals: any[] = []
let createSeq = 0

function stub(roles: string[]) {
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
const ctxFor = (roles: string[], forceFetch = false) =>
  getWorkspaceContext({ payload: stub(roles), user: { id: `u${seq}` }, workspaceId: `w${seq}`, view: 'direct', forceFetch })

async function snapshot() {
  const other = join(await mkdtemp(join(tmpdir(), 'osnova-av-')), 'wt')
  await ensureWorktree({ dir: other, repoUrl: bareDir, branch: 'main' })
  return { files: await listFiles(other), read: async (p: string) => (await readRepoFile(other, p)).toString('utf8') }
}

beforeAll(async () => { process.env.WORKTREES_DIR = await mkdtemp(join(tmpdir(), 'osnova-ao-')) })
beforeEach(async () => { seq += 1; approvals = []; bareDir = (await makeBareOrigin()).bareDir })

describe('approvals service (frontmatter source of truth + DB mirror)', () => {
  it('approver writes a stamp into frontmatter + a DB row with the commit revision', async () => {
    const c = await ctxFor(['workspace_maintainer'])
    const st = await setApproval(c.payload, c, { id: 'u', email: 'c@x.pl', name: 'Klient' }, 'doc.md', 'approved')
    expect(st.status).toBe('approved')
    expect(st.canApprove).toBe(true)
    const doc = await (await snapshot()).read('doc.md')
    expect(doc).toMatch(/approval:/)
    expect(doc).toMatch(/status: approved/)
    expect(approvals).toHaveLength(1)
    expect(approvals[0].revision).toBeTruthy() // SHA commita zatwierdzającego
  })

  it('changes_requested with a note → stamped', async () => {
    const c = await ctxFor(['workspace_maintainer'])
    const st = await setApproval(c.payload, c, { id: 'u', email: 't@x.pl' }, 'doc.md', 'changes_requested', 'popraw sekcję 2')
    expect(st.status).toBe('changes_requested')
    expect(st.note).toBe('popraw sekcję 2')
    expect(await (await snapshot()).read('doc.md')).toMatch(/status: changes_requested/)
  })

  it('editor lacks approve → AccessDenied, no commit', async () => {
    const c = await ctxFor(['editor'])
    await expect(setApproval(c.payload, c, { id: 'e', email: 'e@x.pl' }, 'doc.md', 'approved')).rejects.toBeInstanceOf(AccessDenied)
    expect(await (await snapshot()).read('doc.md')).not.toMatch(/approval:/)
  })

  it('viewer → AccessDenied (no direct view / no approve)', async () => {
    await expect(ctxFor(['viewer']).then((c) => setApproval(c.payload, c, { id: 'v', email: 'v@x.pl' }, 'doc.md', 'approved'))).rejects.toBeInstanceOf(AccessDenied)
  })

  it('getApproval reads the frontmatter stamp (source of truth)', async () => {
    const c = await ctxFor(['workspace_maintainer'])
    await setApproval(c.payload, c, { id: 'u', email: 'c@x.pl', name: 'Klient' }, 'doc.md', 'approved')
    const st = await getApproval(c.payload, await ctxFor(['workspace_maintainer']), 'doc.md')
    expect(st.status).toBe('approved')
    expect(st.authorEmail).toBe('c@x.pl')
    expect(st.stale).toBe(false)
  })

  it('stale flips to true after the document changes post-approval', async () => {
    const c = await ctxFor(['workspace_maintainer'])
    await setApproval(c.payload, c, { id: 'u', email: 'c@x.pl' }, 'doc.md', 'approved')
    await pushExternalChange(bareDir, 'doc.md', '# Doc\n\nzmienione po akceptacji\n')
    const c2 = await ctxFor(['workspace_maintainer'], true)
    const st = await getApproval(c2.payload, c2, 'doc.md')
    expect(st.stale).toBe(true)
    expect(st.status).toBe('approved') // status z bazy (stempel nadpisany edycją)
  })
})
