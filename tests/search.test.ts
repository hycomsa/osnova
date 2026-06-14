import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { getWorkspaceContext, searchWorkspace } from '@/lib/read-service'
import { makeBareOrigin, pushExternalChange } from './helpers/fixture-repo'

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
  bareDir = (await makeBareOrigin()).bareDir // doc.md "linia A/B"
  await pushExternalChange(bareDir, 'tajne/sekret.md', '# Sekret\n\nlinia poufna dostawcy\n')
  process.env.WORKTREES_DIR = await mkdtemp(join(tmpdir(), 'osnova-s-'))
})

describe('searchWorkspace (fail-closed)', () => {
  it('editor (direct) znajduje po treści — w tym sekret', async () => {
    const ctx = await getWorkspaceContext({ payload: stub(['editor']), user: { id: 'e' }, workspaceId: 'ws-s1', view: 'direct' })
    const r = await searchWorkspace(ctx, 'linia')
    const paths = r.map((x) => x.path)
    expect(paths).toContain('doc.md')
    expect(paths).toContain('tajne/sekret.md')
    expect(r.find((x) => x.path === 'doc.md')!.snippet.toLowerCase()).toContain('linia')
  })
  it('client_business (pusty widok) NIE wycieka żadnego wyniku', async () => {
    const ctx = await getWorkspaceContext({ payload: stub(['client_business']), user: { id: 'c' }, workspaceId: 'ws-s2', view: 'client_business' })
    expect(await searchWorkspace(ctx, 'linia')).toEqual([])
    expect(await searchWorkspace(ctx, 'poufna')).toEqual([])
  })
  it('puste zapytanie → brak wyników', async () => {
    const ctx = await getWorkspaceContext({ payload: stub(['editor']), user: { id: 'e' }, workspaceId: 'ws-s3', view: 'direct' })
    expect(await searchWorkspace(ctx, '   ')).toEqual([])
  })
})
