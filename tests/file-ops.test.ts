import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureWorktree, listFiles, readRepoFile } from '@/lib/git/worktree'
import {
  AccessDenied, Conflict, createDocument, deleteDocument, duplicateDocument,
  getHistory, getProperties, getWorkspaceContext, isAttachmentPath, renameDocument, restoreDocument,
  setProperties, writeBinaryDocument, writeDocument,
} from '@/lib/read-service'
import { makeBareOrigin } from './helpers/fixture-repo'

let bareDir: string
let seq = 0
const AUTHOR = { name: 'Ed', email: 'ed@x.pl' }

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
const ctxFor = (roles: string[], view: 'direct' | 'client_business' = 'direct') =>
  getWorkspaceContext({ payload: stub(roles), user: { id: `u${seq}` }, workspaceId: `w${seq}`, view })

async function snapshot() {
  const other = join(await mkdtemp(join(tmpdir(), 'osnova-fv-')), 'wt')
  await ensureWorktree({ dir: other, repoUrl: bareDir, branch: 'main' })
  return { files: await listFiles(other), read: async (p: string) => (await readRepoFile(other, p)).toString('utf8') }
}

beforeAll(async () => {
  process.env.WORKTREES_DIR = await mkdtemp(join(tmpdir(), 'osnova-fo-'))
})
beforeEach(async () => {
  seq += 1
  bareDir = (await makeBareOrigin()).bareDir // świeże bare per test (ma doc.md)
})

describe('file ops (editor / file-manage)', () => {
  it('create → plik w remote', async () => {
    await createDocument(await ctxFor(['editor']), 'nowy/plik.md', '# Nowy\n', AUTHOR)
    expect((await snapshot()).files).toContain('nowy/plik.md')
  })
  it('create istniejącego → Conflict', async () => {
    await expect(createDocument(await ctxFor(['editor']), 'doc.md', 'x', AUTHOR)).rejects.toBeInstanceOf(Conflict)
  })
  it('rename → stary znika, nowy jest', async () => {
    await renameDocument(await ctxFor(['editor']), 'doc.md', 'renamed.md', AUTHOR)
    const v = await snapshot()
    expect(v.files).toContain('renamed.md')
    expect(v.files).not.toContain('doc.md')
  })
  it('duplicate → oba, ta sama treść', async () => {
    await duplicateDocument(await ctxFor(['editor']), 'doc.md', 'copy.md', AUTHOR)
    const v = await snapshot()
    expect(v.files).toEqual(expect.arrayContaining(['doc.md', 'copy.md']))
    expect(await v.read('copy.md')).toEqual(await v.read('doc.md'))
  })
  it('delete → plik znika', async () => {
    await deleteDocument(await ctxFor(['editor']), 'doc.md', AUTHOR)
    expect((await snapshot()).files).not.toContain('doc.md')
  })
  it('restore → przywraca treść z wybranej rewizji (także usuniętego pliku)', async () => {
    const ctx = await ctxFor(['editor'])
    const origRev = (await getHistory(ctx, 'doc.md'))[0].sha
    const orig = await (await snapshot()).read('doc.md')
    await deleteDocument(ctx, 'doc.md', AUTHOR)
    expect((await snapshot()).files).not.toContain('doc.md')
    await restoreDocument(ctx, 'doc.md', origRev, AUTHOR)
    const v = await snapshot()
    expect(v.files).toContain('doc.md')
    expect(await v.read('doc.md')).toEqual(orig)
  })
  it('restore → cofa edycję do poprzedniej treści', async () => {
    const ctx = await ctxFor(['editor'])
    const origRev = (await getHistory(ctx, 'doc.md'))[0].sha
    const orig = await (await snapshot()).read('doc.md')
    await writeDocument(ctx, 'doc.md', '# Zmienione\n', AUTHOR)
    expect(await (await snapshot()).read('doc.md')).toContain('Zmienione')
    await restoreDocument(ctx, 'doc.md', origRev, AUTHOR)
    expect(await (await snapshot()).read('doc.md')).toEqual(orig)
  })
  it('restore bez uprawnienia edycji → AccessDenied', async () => {
    const rev = (await getHistory(await ctxFor(['editor']), 'doc.md'))[0].sha
    const viewerCtx = await ctxFor(['client_business'], 'client_business')
    await expect(restoreDocument(viewerCtx, 'doc.md', rev, AUTHOR)).rejects.toBeInstanceOf(AccessDenied)
  })
  it('properties: odczyt i zapis frontmatter (props-view/props-edit)', async () => {
    const ctx = await ctxFor(['editor'])
    await writeDocument(ctx, 'meta.md', '---\ntitle: Stary\ntags:\n  - a\n  - b\n---\n\n# Treść\n', AUTHOR)
    const p = await getProperties(ctx, 'meta.md')
    expect(p.meta.title).toBe('Stary')
    expect(p.meta.tags).toEqual(['a', 'b'])
    expect(p.canEdit).toBe(true)
    // zapis: koercja string → liczba / JSON tablica
    await setProperties(ctx, 'meta.md', { title: 'Nowy', priority: '3', tags: '["x","y"]' }, AUTHOR)
    const p2 = await getProperties(ctx, 'meta.md')
    expect(p2.meta.title).toBe('Nowy')
    expect(p2.meta.priority).toBe(3)
    expect(p2.meta.tags).toEqual(['x', 'y'])
    expect(await (await snapshot()).read('meta.md')).toContain('# Treść') // treść zachowana
  })
  it('properties: client_business → AccessDenied (brak props-view)', async () => {
    const ctx = await ctxFor(['client_business'], 'client_business')
    await expect(getProperties(ctx, 'doc.md')).rejects.toBeInstanceOf(AccessDenied)
  })
  it('client_business (widok biznesowy) → AccessDenied (brak file-manage)', async () => {
    const ctx = await ctxFor(['client_business'], 'client_business')
    await expect(createDocument(ctx, 'x.md', 'x', AUTHOR)).rejects.toBeInstanceOf(AccessDenied)
  })
  it('traversal poza worktree → AccessDenied', async () => {
    await expect(createDocument(await ctxFor(['editor']), '../evil.md', 'x', AUTHOR)).rejects.toBeInstanceOf(AccessDenied)
  })

  it('writeBinaryDocument: editor zapisuje załącznik, viewer → AccessDenied', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3])
    await writeBinaryDocument(await ctxFor(['editor']), '.attachments/x.png', png, AUTHOR)
    const v = await snapshot()
    expect(v.files).toContain('.attachments/x.png')
    await expect(writeBinaryDocument(await ctxFor(['client_business'], 'client_business'), '.attachments/y.png', png, AUTHOR)).rejects.toBeInstanceOf(AccessDenied)
  })

  it('isAttachmentPath: rozpoznaje katalog .attachments', () => {
    expect(isAttachmentPath('.ai/context/.attachments/x.png')).toBe(true)
    expect(isAttachmentPath('.attachments/y.pdf')).toBe(true)
    expect(isAttachmentPath('.ai/context/README.md')).toBe(false)
    expect(isAttachmentPath('attachments/x.png')).toBe(false)
  })
})
