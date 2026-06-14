import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commitAndPush, ensureWorktree, invalidateWorktreeFetch, listFiles, readRepoFile, withToken, WriteConflict } from '@/lib/git/worktree'
import { addCommit, makeBareOrigin, makeFixtureOrigin, pushExternalChange } from './helpers/fixture-repo'

describe('git worktree', () => {
  it('clone → listFiles → readRepoFile → fetch po nowym commicie', async () => {
    const { originDir } = await makeFixtureOrigin()
    const dir = join(await mkdtemp(join(tmpdir(), 'osnova-wt-')), 'ws1')
    await ensureWorktree({ dir, repoUrl: originDir, branch: 'main' })
    const files = await listFiles(dir)
    expect(files).toContain('README.md')
    expect(files).toContain('wewnetrzne/notatki.md')
    const readme = await readRepoFile(dir, 'README.md')
    expect(readme.toString('utf8')).toContain('# AI SDLC')
    await addCommit(originDir, 'nowy/plik.md', '# Nowy')
    // fetch jest throttlowany (TTL) — wymuszamy odświeżenie tak, jak robi to zapis dokumentu
    invalidateWorktreeFetch(dir)
    await ensureWorktree({ dir, repoUrl: originDir, branch: 'main' })
    expect(await listFiles(dir)).toContain('nowy/plik.md')
  })
  it('readRepoFile odrzuca ucieczkę poza worktree', async () => {
    const { originDir } = await makeFixtureOrigin()
    const dir = join(await mkdtemp(join(tmpdir(), 'osnova-wt-')), 'ws2')
    await ensureWorktree({ dir, repoUrl: originDir, branch: 'main' })
    await expect(readRepoFile(dir, '../outside.txt')).rejects.toThrow()
  })
  it('zapis na nieaktualną kopię → WriteConflict z obiema wersjami (kreator FR-19a)', async () => {
    const { bareDir } = await makeBareOrigin()
    const dir = join(await mkdtemp(join(tmpdir(), 'osnova-wt-')), 'wsC')
    await ensureWorktree({ dir, repoUrl: bareDir, branch: 'main' })
    // równoległa zmiana tej samej linii prosto na remote
    await pushExternalChange(bareDir, 'doc.md', '# Doc\n\nlinia A ZDALNA\nlinia B\n')
    // nasz zapis na nieaktualnej bazie → konflikt
    let err: unknown
    try {
      await commitAndPush({
        dir, relPath: 'doc.md', content: '# Doc\n\nlinia A MOJA\nlinia B\n', branch: 'main',
        authorName: 'Ja', authorEmail: 'ja@osnova.local', message: 'osnova: edycja doc.md', detectConflict: true,
      })
    } catch (e) { err = e }
    expect(err).toBeInstanceOf(WriteConflict)
    const detail = (err as WriteConflict).detail
    expect(detail.yours).toContain('MOJA')
    expect(detail.theirs).toContain('ZDALNA')
    expect(detail.remoteRevision).toMatch(/^[0-9a-f]{7,40}$/)
    // worktree wyrównany do zdalnej — czysta baza pod zapis rozwiązania
    expect((await readRepoFile(dir, 'doc.md')).toString('utf8')).toContain('ZDALNA')
    // zapis rozwiązania nakłada się czysto i pushuje
    const { commit } = await commitAndPush({
      dir, relPath: 'doc.md', content: '# Doc\n\nlinia A SCALONA\nlinia B\n', branch: 'main',
      authorName: 'Ja', authorEmail: 'ja@osnova.local', message: 'osnova: edycja doc.md', detectConflict: true,
    })
    expect(commit).toMatch(/^[0-9a-f]{40}$/)
  })
  it('withToken wstrzykuje token do URL https', () => {
    expect(withToken('https://gitlab.hycom.pl/csl/ai-sdlc.git', 'tkn')).toBe(
      'https://oauth2:tkn@gitlab.hycom.pl/csl/ai-sdlc.git',
    )
    expect(withToken('https://gitlab.hycom.pl/csl/ai-sdlc.git', undefined)).toBe(
      'https://gitlab.hycom.pl/csl/ai-sdlc.git',
    )
    expect(withToken('/local/path', 'tkn')).toBe('/local/path')
  })
})
