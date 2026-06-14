import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { blame, ensureWorktree, fileAtRevision, fileHistory } from '@/lib/git/worktree'
import { makeBareOrigin, pushExternalChange } from './helpers/fixture-repo'

let dir: string
beforeAll(async () => {
  const { bareDir } = await makeBareOrigin() // commit 1: doc.md "linia A/B"
  await pushExternalChange(bareDir, 'doc.md', '# Doc\n\nlinia A zmieniona\nlinia B\nlinia C\n') // commit 2
  dir = join(await mkdtemp(join(tmpdir(), 'osnova-h-')), 'wt')
  await ensureWorktree({ dir, repoUrl: bareDir, branch: 'main' })
})

describe('git history / blame', () => {
  it('fileHistory zwraca >=2 rewizje z autorem/datą/wiadomością', async () => {
    const h = await fileHistory(dir, 'doc.md')
    expect(h.length).toBeGreaterThanOrEqual(2)
    expect(h[0].sha).toMatch(/^[0-9a-f]{40}$/)
    expect(h[0].author).toBeTruthy()
    expect(h[0].date).toMatch(/\d{4}-\d{2}-\d{2}/)
  })
  it('fileAtRevision pokazuje treść z danej rewizji', async () => {
    const h = await fileHistory(dir, 'doc.md')
    const oldest = h[h.length - 1].sha
    const newest = h[0].sha
    expect(await fileAtRevision(dir, oldest, 'doc.md')).toContain('linia A')
    expect(await fileAtRevision(dir, newest, 'doc.md')).toContain('linia A zmieniona')
  })
  it('fileAtRevision odrzuca niepoprawną rewizję', async () => {
    await expect(fileAtRevision(dir, 'main; rm -rf /', 'doc.md')).rejects.toThrow()
  })
  it('blame zwraca linie z autorem', async () => {
    const b = await blame(dir, 'doc.md')
    expect(b.length).toBeGreaterThan(0)
    expect(b[0].author).toBeTruthy()
    expect(b.some((l) => l.content.includes('linia C'))).toBe(true)
  })
})
