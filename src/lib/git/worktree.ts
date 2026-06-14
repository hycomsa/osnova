import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { simpleGit } from 'simple-git'

export function withToken(repoUrl: string, token?: string | null): string {
  if (!token) return repoUrl
  if (!/^https?:\/\//i.test(repoUrl)) return repoUrl
  const url = new URL(repoUrl)
  url.username = 'oauth2'
  url.password = token
  return url.toString()
}

// throttling pobrań: nie rób `git fetch` przy każdym żądaniu (getWorkspaceContext wołane
// ~6× na otwarcie strony — bez tego każdy odczyt czekał na fetch, a przy offline remote po timeout).
const FETCH_TTL_MS = 20_000
const lastFetch = new Map<string, number>()

export async function ensureWorktree(opts: { dir: string; repoUrl: string; branch: string }): Promise<void> {
  const { dir, repoUrl, branch } = opts
  if (!existsSync(join(dir, '.git'))) {
    await mkdir(dir, { recursive: true })
    await simpleGit().clone(repoUrl, dir, ['--branch', branch, '--single-branch'])
    lastFetch.set(dir, Date.now())
    return
  }
  // pomiń fetch, jeśli niedawno odświeżono (świeżość zapewnia polling rewizji co ~30s)
  const now = Date.now()
  if (now - (lastFetch.get(dir) ?? 0) < FETCH_TTL_MS) return
  lastFetch.set(dir, now) // ustaw przed próbą — przy błędzie nie ponawiaj w kółko
  // krótki timeout, by offline/niedostępny remote nie blokował odczytu na długo
  const git = simpleGit(dir, { timeout: { block: 5000 } })
  try {
    await git.fetch('origin', branch)
    await git.checkout(branch)
    await git.reset(['--hard', `origin/${branch}`])
  } catch (e) {
    // brak sieci / niedostępny remote — kontynuuj na istniejącej kopii roboczej (odczyt offline)
    console.warn(`[osnova] worktree fetch failed, using cached copy: ${String((e as Error).message).split('\n')[0]}`)
  }
}

// wymuszone odświeżenie (po zapisie) — pomija throttle
export function invalidateWorktreeFetch(dir: string): void { lastFetch.delete(dir) }

export async function listFiles(dir: string): Promise<string[]> {
  const out = await simpleGit(dir).raw(['ls-files'])
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

// pliki śledzone, które jednocześnie pasują do reguł .gitignore (git je trzyma, ale powinny być ukryte)
export async function listIgnoredTracked(dir: string): Promise<string[]> {
  try {
    const out = await simpleGit(dir).raw(['ls-files', '-i', '-c', '--exclude-standard'])
    return out.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

export async function readRepoFile(dir: string, relPath: string): Promise<Buffer> {
  const rootAbs = resolve(dir)
  const fileAbs = resolve(dir, relPath)
  if (fileAbs !== rootAbs && !fileAbs.startsWith(rootAbs + sep)) {
    throw new Error(`Path escapes worktree: ${relPath}`)
  }
  return readFile(fileAbs)
}


export class PushConflict extends Error {
  code = 'PUSH_CONFLICT' as const
}

// Zdalne repozytorium nieosiągalne lub odmowa (sieć/DNS/uwierzytelnianie) — NIE jest to
// konflikt treści (nie otwieramy kreatora scalania). Czytelny komunikat dla użytkownika.
export class RemoteUnavailable extends Error {
  code = 'REMOTE_UNAVAILABLE' as const
}

// Czy błąd push to odrzucenie „non-fast-forward" (zdalne się ruszyło) — wtedy próbujemy rebase.
// Inne błędy (DNS/sieć/uwierzytelnianie) traktujemy jako niedostępność zdalnego.
function isNonFastForward(msg: string): boolean {
  return /non-fast-forward|\[rejected\]|fetch first|Updates were rejected|cannot lock ref|failed to push some refs/i.test(msg)
}

// Konflikt zapisu treści, gdy automatyczny rebase/merge się nie powiódł — niesie obie
// wersje (twoją i zdalną) oraz bazę, by frontend mógł poprowadzić użytkownika przez
// rozwiązanie bez znajomości Git (FR-19a, US-21).
export class WriteConflict extends Error {
  code = 'WRITE_CONFLICT' as const
  constructor(
    public detail: { path: string; yours: string; theirs: string; base: string | null; remoteRevision: string },
  ) {
    super('Konflikt zapisu: treść została zmieniona zdalnie')
  }
}

function assertInside(dir: string, relPath: string): string {
  const rootAbs = resolve(dir)
  const fileAbs = resolve(dir, relPath)
  if (fileAbs !== rootAbs && !fileAbs.startsWith(rootAbs + sep)) {
    throw new Error(`Path escapes worktree: ${relPath}`)
  }
  return fileAbs
}

export interface Author {
  authorName: string
  authorEmail: string
}

async function commitPushRetry(
  git: ReturnType<typeof simpleGit>,
  author: Author,
  message: string,
  branch: string,
): Promise<{ commit: string }> {
  const ident = ['-c', `user.name=${author.authorName}`, '-c', `user.email=${author.authorEmail}`]
  await git.raw([...ident, 'commit', '-m', message])
  try {
    await git.push('origin', branch)
  } catch (e) {
    // tylko odrzucenie non-fast-forward oznacza, że zdalne się ruszyło → rebase i ponów;
    // sieć/DNS/uwierzytelnianie → zdalne niedostępne (nie konflikt treści)
    if (!isNonFastForward(String((e as Error)?.message || ''))) {
      throw new RemoteUnavailable('Nie udało się połączyć ze zdalnym repozytorium (sieć lub uprawnienia).')
    }
    try {
      await git.raw([...ident, 'pull', '--rebase', 'origin', branch])
    } catch (e2) {
      await git.raw(['rebase', '--abort']).catch(() => {})
      // rebase nie powiódł się z powodów sieciowych, nie treściowych → niedostępność, nie konflikt
      if (!/conflict|CONFLICT|could not apply|merge/i.test(String((e2 as Error)?.message || ''))) {
        throw new RemoteUnavailable('Nie udało się pobrać zmian ze zdalnego repozytorium (sieć lub uprawnienia).')
      }
      throw new PushConflict('Konflikt podczas scalania zmian zdalnych')
    }
    await git.push('origin', branch)
  }
  const sha = (await git.revparse(['HEAD'])).trim()
  return { commit: sha }
}

export async function commitAndPush(opts: {
  dir: string
  relPath: string
  content: string
  branch: string
  authorName: string
  authorEmail: string
  message: string
  // gdy true, a auto-rebase się nie powiedzie, rzuć WriteConflict z obiema wersjami
  // (do kreatora rozwiązania) i przywróć worktree do stanu zdalnego
  detectConflict?: boolean
}): Promise<{ commit: string }> {
  const { dir, relPath, content, branch, message, detectConflict } = opts
  const fileAbs = assertInside(dir, relPath)
  await mkdir(dirname(fileAbs), { recursive: true })
  await writeFile(fileAbs, content, 'utf8')
  const git = simpleGit(dir)
  await git.add(relPath)
  if (!detectConflict) return commitPushRetry(git, opts, message, branch)
  try {
    return await commitPushRetry(git, opts, message, branch)
  } catch (e) {
    if (!(e instanceof PushConflict)) throw e
    // zbierz wersję zdalną i wspólną bazę dla kreatora, potem wyrównaj worktree do origin
    await git.fetch('origin', branch).catch(() => {})
    const remoteRevision = (await git.revparse([`origin/${branch}`]).catch(() => '')).trim()
    let theirs = ''
    try { theirs = await git.raw(['show', `origin/${branch}:${relPath}`]) } catch { theirs = '' }
    let base: string | null = null
    try {
      const mb = (await git.raw(['merge-base', 'HEAD', `origin/${branch}`])).trim()
      if (mb) base = await git.raw(['show', `${mb}:${relPath}`])
    } catch { base = null }
    // porzuć nasz lokalny commit i wróć do stanu zdalnego — kolejny zapis (rozwiązanie)
    // nałoży się czysto na origin/branch (treść użytkownika zachowana w payloadzie błędu)
    await git.raw(['rebase', '--abort']).catch(() => {})
    await git.reset(['--hard', `origin/${branch}`]).catch(() => {})
    throw new WriteConflict({ path: relPath, yours: content, theirs, base, remoteRevision })
  }
}

export async function commitBinaryAndPush(opts: {
  dir: string
  relPath: string
  data: Buffer
  branch: string
  authorName: string
  authorEmail: string
  message: string
}): Promise<{ commit: string }> {
  const { dir, relPath, data, branch, message } = opts
  const fileAbs = assertInside(dir, relPath)
  await mkdir(dirname(fileAbs), { recursive: true })
  await writeFile(fileAbs, data)
  const git = simpleGit(dir)
  await git.add(relPath)
  return commitPushRetry(git, opts, message, branch)
}

export async function deleteAndPush(opts: {
  dir: string
  relPath: string
  branch: string
  authorName: string
  authorEmail: string
  message: string
}): Promise<{ commit: string }> {
  const { dir, relPath, branch, message } = opts
  assertInside(dir, relPath)
  const git = simpleGit(dir)
  await git.raw(['rm', '--', relPath])
  return commitPushRetry(git, opts, message, branch)
}

export async function moveAndPush(opts: {
  dir: string
  from: string
  to: string
  branch: string
  authorName: string
  authorEmail: string
  message: string
}): Promise<{ commit: string }> {
  const { dir, from, to, branch, message } = opts
  assertInside(dir, from)
  const toAbs = assertInside(dir, to)
  await mkdir(dirname(toAbs), { recursive: true })
  const git = simpleGit(dir)
  await git.raw(['mv', '--', from, to])
  return commitPushRetry(git, opts, message, branch)
}

export async function pathExists(dir: string, relPath: string): Promise<boolean> {
  const files = await listFiles(dir)
  return files.includes(relPath.replace(/^\.\//, ''))
}

export async function currentRevision(dir: string): Promise<string> {
  return (await simpleGit(dir).revparse(['HEAD'])).trim()
}

// SHA ostatniego commita, który dotknął danego pliku (do wykrywania nieaktualnych akceptacji)
export async function fileRevision(dir: string, relPath: string): Promise<string | null> {
  assertInside(dir, relPath)
  const out = await simpleGit(dir).raw(['log', '-1', '--format=%H', '--', relPath])
  return out.trim() || null
}

// Mapa ścieżka→SHA ostatniego commita w JEDNYM przejściu logu (masowe wykrycie „stale" w raportach,
// bez wywoływania fileRevision per plik). Dla zwykłej liniowej historii w pełni wystarcza.
export async function fileCommitShas(dir: string): Promise<Map<string, string>> {
  const out = await simpleGit(dir).raw(['log', '--format=%H', '--name-only'])
  const map = new Map<string, string>()
  let cur = ''
  for (const line of out.split('\n')) {
    const l = line.trim()
    if (!l) continue
    if (/^[0-9a-f]{40}$/i.test(l)) { cur = l; continue }
    if (cur && !map.has(l)) map.set(l, cur) // pierwszy napotkany = najnowszy commit dla ścieżki
  }
  return map
}

export interface Revision {
  sha: string
  author: string
  date: string
  message: string
}

export async function fileHistory(dir: string, relPath: string, limit = 50): Promise<Revision[]> {
  assertInside(dir, relPath)
  const SEP = '\x1f'
  const out = await simpleGit(dir).raw([
    'log', `--max-count=${limit}`, '--follow', `--format=%H${SEP}%an${SEP}%aI${SEP}%s`, '--', relPath,
  ])
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [sha, author, date, message] = l.split(SEP)
      return { sha, author, date, message }
    })
}

// Zunifikowany diff pliku między rewizją `base` a `head` (domyślnie HEAD).
export async function fileDiff(dir: string, relPath: string, base: string, head = 'HEAD'): Promise<string> {
  if (!/^[0-9a-f]{7,40}$/i.test(base)) throw new Error(`Invalid revision: ${base}`)
  if (head !== 'HEAD' && !/^[0-9a-f]{7,40}$/i.test(head)) throw new Error(`Invalid revision: ${head}`)
  assertInside(dir, relPath)
  return simpleGit(dir).raw(['diff', '--no-color', base, head, '--', relPath])
}

export async function fileAtRevision(dir: string, rev: string, relPath: string): Promise<string> {
  if (!/^[0-9a-f]{7,40}$/i.test(rev)) throw new Error(`Invalid revision: ${rev}`)
  assertInside(dir, relPath)
  return simpleGit(dir).raw(['show', `${rev}:${relPath}`])
}

export interface BlameLine {
  sha: string
  author: string
  content: string
}

export async function blame(dir: string, relPath: string): Promise<BlameLine[]> {
  assertInside(dir, relPath)
  const out = await simpleGit(dir).raw(['blame', '--line-porcelain', '--', relPath])
  const lines: BlameLine[] = []
  let sha = ''
  let author = ''
  for (const line of out.split('\n')) {
    if (/^[0-9a-f]{40} /.test(line)) sha = line.slice(0, 40)
    else if (line.startsWith('author ')) author = line.slice(7)
    else if (line.startsWith('\t')) lines.push({ sha: sha.slice(0, 8), author, content: line.slice(1) })
  }
  return lines
}
