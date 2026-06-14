import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { isPathAllowed } from '@/lib/content-access'
import { AccessDenied, getDocument, getTree, getWorkspaceContext } from '@/lib/read-service'
import { ALL_VIEWS, allowedViews, type ViewName, type WorkspaceRole } from '@/lib/roles'
import { FIXTURE_FILES, makeFixtureOrigin } from './helpers/fixture-repo'

let originDir: string
const FORBIDDEN_FOR_CLIENTS = 'wewnetrzne/notatki.md'
const CLIENT_ROLES: WorkspaceRole[] = ['client_business', 'client_technical', 'viewer']

function stubPayload(roles: WorkspaceRole[]) {
  return {
    find: async ({ collection, where }: { collection: string; where?: any }) => {
      if (collection === 'workspaces') { const v = where?.id?.equals ?? where?.slug?.equals; return { docs: [{ id: v, slug: String(v), name: String(v) }] } }
      if (collection === 'memberships') return { docs: [{ roles }] }
      if (collection === 'repo-bindings') return { docs: [{ repoUrl: originDir, branch: 'main' }] }
      if (collection === 'view-configs') return { docs: [] }
      throw new Error(`unexpected ${collection}`)
    },
  } as any
}

beforeAll(async () => {
  originDir = (await makeFixtureOrigin()).originDir
  process.env.WORKTREES_DIR = await mkdtemp(join(tmpdir(), 'osnova-sec-'))
})

describe('no-leak: role × widok', () => {
  for (const role of CLIENT_ROLES) {
    it(`${role}: widok direct jest odmówiony`, async () => {
      await expect(
        getWorkspaceContext({ payload: stubPayload([role]), user: { id: role }, workspaceId: `sec-${role}-direct`, view: 'direct' }),
      ).rejects.toBeInstanceOf(AccessDenied)
    })

    for (const view of ALL_VIEWS.filter((v) => v !== 'direct') as ViewName[]) {
      it(`${role} × ${view}: brak wycieku plików wewnętrznych; każdy zwrócony plik przechodzi isPathAllowed`, async () => {
        if (!allowedViews([role]).includes(view)) {
          await expect(
            getWorkspaceContext({ payload: stubPayload([role]), user: { id: role }, workspaceId: `sec-${role}-${view}`, view }),
          ).rejects.toBeInstanceOf(AccessDenied)
          return
        }
        const ctx = await getWorkspaceContext({ payload: stubPayload([role]), user: { id: role }, workspaceId: `sec-${role}-${view}`, view })
        const tree = await getTree(ctx)
        expect(tree).not.toContain(FORBIDDEN_FOR_CLIENTS)
        for (const p of tree) expect(isPathAllowed(p, ctx.rules)).toBe(true)
        await expect(getDocument(ctx, FORBIDDEN_FOR_CLIENTS)).rejects.toBeInstanceOf(AccessDenied)
      })
    }
  }

  it('sanity: plik wewnętrzny istnieje w repo (test nie jest pusty)', () => {
    expect(Object.keys(FIXTURE_FILES)).toContain(FORBIDDEN_FOR_CLIENTS)
  })
})
