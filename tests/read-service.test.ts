import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { AccessDenied, getDocument, getTree, getWorkspaceContext } from '@/lib/read-service'
import { makeFixtureOrigin } from './helpers/fixture-repo'

let originDir: string

function stubPayload(opts: {
  roles?: string[]
  hasMembership?: boolean
  viewConfig?: { view: string; includeGlobs?: { glob: string }[]; excludeGlobs?: { glob: string }[]; source?: string } | null
}) {
  const { roles = [], hasMembership = true, viewConfig = null } = opts
  return {
    find: async ({ collection, where }: { collection: string; where?: any }) => {
      if (collection === 'workspaces') { const v = where?.id?.equals ?? where?.slug?.equals; return { docs: [{ id: v, slug: String(v), name: String(v) }] } }
      if (collection === 'memberships') return { docs: hasMembership ? [{ roles }] : [] }
      if (collection === 'repo-bindings') return { docs: [{ repoUrl: originDir, branch: 'main', credentialRef: null }] }
      if (collection === 'view-configs') return { docs: viewConfig ? [viewConfig] : [] }
      throw new Error(`unexpected collection ${collection}`)
    },
  } as any
}

const USER = { id: 'u1', globalRoles: [] as string[] }
const ADMIN = { id: 'admin', globalRoles: ['system_admin'] }

beforeAll(async () => {
  originDir = (await makeFixtureOrigin()).originDir
  process.env.WORKTREES_DIR = await mkdtemp(join(tmpdir(), 'osnova-rs-'))
})

describe('read-service', () => {
  it('editor + direct widzi pliki wewnętrzne', async () => {
    const ctx = await getWorkspaceContext({ payload: stubPayload({ roles: ['editor'] }), user: USER, workspaceId: 'ws-a', view: 'direct' })
    const tree = await getTree(ctx)
    expect(tree).toContain('wewnetrzne/notatki.md')
    expect(ctx.allowedViews).toEqual(['direct', 'client_business', 'client_technical'])
  })
  it('client_business widzi tylko zakres biznesowy (z .docs.config.yaml)', async () => {
    const ctx = await getWorkspaceContext({ payload: stubPayload({ roles: ['client_business'] }), user: USER, workspaceId: 'ws-b', view: 'client_business' })
    const tree = await getTree(ctx)
    expect(tree.sort()).toEqual(['README.md', 'intencje/cel.md', 'specyfikacje/spec-funkcjonalna.md'])
  })
  it('client_business + direct → AccessDenied', async () => {
    await expect(
      getWorkspaceContext({ payload: stubPayload({ roles: ['client_business'] }), user: USER, workspaceId: 'ws-c', view: 'direct' }),
    ).rejects.toBeInstanceOf(AccessDenied)
  })
  it('brak członkostwa (nie-admin) → AccessDenied', async () => {
    await expect(
      getWorkspaceContext({ payload: stubPayload({ hasMembership: false }), user: USER, workspaceId: 'ws-d', view: 'client_business' }),
    ).rejects.toBeInstanceOf(AccessDenied)
  })
  it('system_admin bez członkostwa działa', async () => {
    const ctx = await getWorkspaceContext({ payload: stubPayload({ hasMembership: false }), user: ADMIN, workspaceId: 'ws-e', view: 'direct' })
    expect((await getTree(ctx)).length).toBeGreaterThan(0)
  })
  it('getDocument: 403 poza widokiem, render md w widoku', async () => {
    const ctx = await getWorkspaceContext({ payload: stubPayload({ roles: ['client_business'] }), user: USER, workspaceId: 'ws-f', view: 'client_business' })
    await expect(getDocument(ctx, 'wewnetrzne/notatki.md')).rejects.toBeInstanceOf(AccessDenied)
    const doc = await getDocument(ctx, 'README.md')
    expect(doc.kind).toBe('markdown')
    if (doc.kind === 'markdown') expect(doc.html).toContain('<h1 id="ai-sdlc">AI SDLC</h1>')
  })
  it("override z Osnovy (source='osnova') wygrywa nad plikiem", async () => {
    const ctx = await getWorkspaceContext({
      payload: stubPayload({
        roles: ['client_business'],
        viewConfig: { view: 'client_business', includeGlobs: [{ glob: 'intencje/**' }], source: 'osnova' },
      }),
      user: USER,
      workspaceId: 'ws-g',
      view: 'client_business',
    })
    expect(await getTree(ctx)).toEqual(['intencje/cel.md'])
  })
})
