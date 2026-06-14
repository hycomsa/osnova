import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PushConflict, commitAndPush, commitBinaryAndPush, ensureWorktree, readRepoFile } from '@/lib/git/worktree'
import { makeBareOrigin, pushExternalChange } from './helpers/fixture-repo'

async function freshClone(bareDir: string) {
  const dir = join(await mkdtemp(join(tmpdir(), 'osnova-c-')), 'wt')
  await ensureWorktree({ dir, repoUrl: bareDir, branch: 'main' })
  return dir
}

describe('commitAndPush', () => {
  it('zapis → commit (autor=user) → push do remote', async () => {
    const { bareDir } = await makeBareOrigin()
    const dir = await freshClone(bareDir)
    const { commit } = await commitAndPush({
      dir, relPath: 'doc.md', content: '# Doc\n\nzmienione\n', branch: 'main',
      authorName: 'Tomasz', authorEmail: 't@hycom.pl', message: 'osnova: edit doc.md',
    })
    expect(commit).toMatch(/^[0-9a-f]{7,40}$/)
    // niezależny klon widzi zmianę
    const other = await freshClone(bareDir)
    expect((await readRepoFile(other, 'doc.md')).toString('utf8')).toContain('zmienione')
  })

  it('remote się ruszył (niekonfliktowo) → rebase + retry push', async () => {
    const { bareDir } = await makeBareOrigin()
    const dir = await freshClone(bareDir)
    await pushExternalChange(bareDir, 'inny.md', '# Inny\n')
    const { commit } = await commitAndPush({
      dir, relPath: 'doc.md', content: '# Doc\n\nmoja zmiana\n', branch: 'main',
      authorName: 'A', authorEmail: 'a@x.pl', message: 'edit',
    })
    expect(commit).toBeTruthy()
    const other = await freshClone(bareDir)
    expect((await readRepoFile(other, 'doc.md')).toString('utf8')).toContain('moja zmiana')
    expect((await readRepoFile(other, 'inny.md')).toString('utf8')).toContain('# Inny')
  })

  it('commitBinaryAndPush: zapisuje bajty (PNG) i pushuje do remote', async () => {
    const { bareDir } = await makeBareOrigin()
    const dir = await freshClone(bareDir)
    // minimalny nagłówek PNG (8 bajtów sygnatury)
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3])
    const { commit } = await commitBinaryAndPush({
      dir, relPath: '.attachments/x.png', data: png, branch: 'main',
      authorName: 'A', authorEmail: 'a@x.pl', message: 'osnova: załącznik',
    })
    expect(commit).toMatch(/^[0-9a-f]{7,40}$/)
    const other = await freshClone(bareDir)
    const got = await readRepoFile(other, '.attachments/x.png')
    expect(Buffer.compare(got, png)).toBe(0)
  })

  it('konflikt na tym samym pliku → PushConflict (bez utraty lokalnych zmian)', async () => {
    const { bareDir } = await makeBareOrigin()
    const dir = await freshClone(bareDir)
    await pushExternalChange(bareDir, 'doc.md', '# Doc\n\nZDALNA WERSJA\nlinia B\n')
    await expect(
      commitAndPush({
        dir, relPath: 'doc.md', content: '# Doc\n\nMOJA WERSJA\nlinia B\n', branch: 'main',
        authorName: 'A', authorEmail: 'a@x.pl', message: 'edit',
      }),
    ).rejects.toBeInstanceOf(PushConflict)
  })
})
