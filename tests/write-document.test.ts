import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { ensureWorktree, readRepoFile } from '@/lib/git/worktree'
import { AccessDenied, getRawDocument, getWorkspaceContext, writeDocument } from '@/lib/read-service'
import { makeBareOrigin } from './helpers/fixture-repo'

let bareDir: string

function stub(roles: string[]) {
  return {
    find: async ({ collection, where }: { collection: string; where?: any }) => {
      if (collection === 'workspaces') { const v = where?.id?.equals ?? where?.slug?.equals; return { docs: [{ id: v, slug: String(v), name: String(v) }] } }
      if (collection === 'memberships') return { docs: [{ roles }] }
      if (collection === 'repo-bindings') return { docs: [{ repoUrl: bareDir, branch: 'main', credentialRef: null }] }
      if (collection === 'view-configs') return { docs: [] }
      throw new Error(collection)
    },
  } as any
}

beforeAll(async () => {
  bareDir = (await makeBareOrigin()).bareDir
  process.env.WORKTREES_DIR = await mkdtemp(join(tmpdir(), 'osnova-wd-'))
})

describe('writeDocument / getRawDocument (authz)', () => {
  it('editor (direct): raw read + zapis → commit+push', async () => {
    const ctx = await getWorkspaceContext({ payload: stub(['editor']), user: { id: 'e' }, workspaceId: 'w-edit', view: 'direct' })
    expect((await getRawDocument(ctx, 'doc.md')).content).toContain('linia A')
    const { commit } = await writeDocument(ctx, 'doc.md', '# Doc\n\nedytowane przez Osnovę\n', { name: 'Ed', email: 'ed@x.pl' })
    expect(commit).toBeTruthy()
    // niezależny klon bare widzi zmianę
    const other = join(await mkdtemp(join(tmpdir(), 'osnova-v-')), 'wt')
    await ensureWorktree({ dir: other, repoUrl: bareDir, branch: 'main' })
    expect((await readRepoFile(other, 'doc.md')).toString('utf8')).toContain('edytowane przez Osnovę')
  })

  it('client_business: brak uprawnienia edycji → AccessDenied', async () => {
    const ctx = await getWorkspaceContext({ payload: stub(['client_business']), user: { id: 'c' }, workspaceId: 'w-cli', view: 'client_business' })
    await expect(writeDocument(ctx, 'doc.md', 'x', { name: 'C', email: 'c@x.pl' })).rejects.toBeInstanceOf(AccessDenied)
  })

  it('client_business: raw read pliku poza (pustym) widokiem → AccessDenied', async () => {
    const ctx = await getWorkspaceContext({ payload: stub(['client_business']), user: { id: 'c' }, workspaceId: 'w-cli2', view: 'client_business' })
    await expect(getRawDocument(ctx, 'doc.md')).rejects.toBeInstanceOf(AccessDenied)
  })

  it('system_admin: może zapisać', async () => {
    const ctx = await getWorkspaceContext({ payload: stub([]), user: { id: 'a', globalRoles: ['system_admin'] }, workspaceId: 'w-adm', view: 'direct' })
    const { commit } = await writeDocument(ctx, 'doc.md', '# Doc\n\nadmin edit\n', { name: 'Adm', email: 'a@x.pl' })
    expect(commit).toBeTruthy()
  })
})
