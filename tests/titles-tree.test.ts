import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getDocsNodes, getProperties, getWorkspaceContext, setDisplayName, setProperties } from '@/lib/read-service'
import { applyTitles } from '@/lib/titles'
import { makeBareOrigin } from './helpers/fixture-repo'

let bareDir: string
let seq = 0
const AUTHOR = { name: 'Ed', email: 'ed@x.pl' }

function stub(roles: string[]) {
  return {
    find: async ({ collection, where }: any) => {
      if (collection === 'workspaces') { const v = where?.id?.equals ?? where?.slug?.equals; return { docs: [{ id: v, slug: String(v), name: String(v) }] } }
      if (collection === 'memberships') return { docs: [{ roles }] }
      if (collection === 'repo-bindings') return { docs: [{ repoUrl: bareDir, branch: 'main', credentialRef: null }] }
      if (collection === 'view-configs') return { docs: [] }
      return { docs: [] }
    },
  } as any
}
const ctxFor = (roles: string[]) => getWorkspaceContext({ payload: stub(roles), user: { id: `u${seq}` }, workspaceId: `w${seq}`, view: 'direct' })

beforeAll(async () => { process.env.WORKTREES_DIR = await mkdtemp(join(tmpdir(), 'osnova-tt-')) })
beforeEach(async () => { seq += 1; bareDir = (await makeBareOrigin()).bareDir })

describe('display name (frontmatter `name`) + friendly tree labels', () => {
  it('setDisplayName MERGES — preserves other frontmatter keys', async () => {
    const ctx = await ctxFor(['workspace_maintainer'])
    await setProperties(ctx, 'doc.md', { 'doc-type': 'func-spec', owner: 'team-a' }, AUTHOR)
    await setDisplayName(ctx, 'doc.md', 'Mini baza wiedzy', AUTHOR)
    const { meta } = await getProperties(await ctxFor(['workspace_maintainer']), 'doc.md')
    expect(meta.name).toBe('Mini baza wiedzy')
    expect(meta['doc-type']).toBe('func-spec') // nie skasowane
    expect(meta.owner).toBe('team-a')
  })

  it('blank name removes the property (falls back to filename/H1)', async () => {
    const ctx = await ctxFor(['workspace_maintainer'])
    await setDisplayName(ctx, 'doc.md', 'Tymczasowa', AUTHOR)
    await setDisplayName(await ctxFor(['workspace_maintainer']), 'doc.md', '', AUTHOR)
    const { meta } = await getProperties(await ctxFor(['workspace_maintainer']), 'doc.md')
    expect(meta.name).toBeUndefined()
  })

  it('tree label uses friendly name; falls back to H1 then filename', async () => {
    // bez frontmattera: doc.md ma „# Doc" → etykieta z H1
    let nodes = await getDocsNodes(await ctxFor(['workspace_maintainer']))
    await applyTitles(await ctxFor(['workspace_maintainer']), nodes)
    expect(nodes.find((n) => n.path === 'doc.md')?.label).toBe('Doc')
    // po nadaniu name → etykieta = name
    await setDisplayName(await ctxFor(['workspace_maintainer']), 'doc.md', 'Przyjazna nazwa', AUTHOR)
    nodes = await getDocsNodes(await ctxFor(['workspace_maintainer']))
    await applyTitles(await ctxFor(['workspace_maintainer']), nodes)
    expect(nodes.find((n) => n.path === 'doc.md')?.label).toBe('Przyjazna nazwa')
  })
})
