import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'

export const DOCS_CONFIG_YAML = `
views:
  client_business:
    include:
      - "README.md"
      - "intencje/**"
      - "specyfikacje/**"
  client_technical:
    include:
      - "README.md"
      - "intencje/**"
      - "specyfikacje/**"
      - "adr/**"
      - "infrastruktura/**"
`

export const FIXTURE_FILES: Record<string, string> = {
  'README.md': '# AI SDLC\n\nDokumentacja projektu.',
  '.docs.config.yaml': DOCS_CONFIG_YAML,
  'intencje/cel.md': '# Cel\n\nIntencja biznesowa.',
  'specyfikacje/spec-funkcjonalna.md': '# Spec\n\n```mermaid\ngraph TD; A-->B;\n```',
  'adr/adr-001.md': '# ADR-001\n\nDecyzja architektoniczna.',
  'infrastruktura/siec.md': '# Sieć',
  'wewnetrzne/notatki.md': '# Wewnętrzne notatki dostawcy',
}

export async function makeFixtureOrigin(): Promise<{ originDir: string }> {
  const originDir = await mkdtemp(join(tmpdir(), 'osnova-origin-'))
  const git = simpleGit(originDir)
  await git.init(['-b', 'main'])
  await git.addConfig('user.email', 'test@osnova.local')
  await git.addConfig('user.name', 'Test')
  for (const [rel, content] of Object.entries(FIXTURE_FILES)) {
    const abs = join(originDir, rel)
    await mkdir(join(abs, '..'), { recursive: true })
    await writeFile(abs, content, 'utf8')
  }
  await git.add('.')
  await git.commit('init fixture')
  return { originDir }
}

export async function addCommit(originDir: string, rel: string, content: string): Promise<void> {
  const abs = join(originDir, rel)
  await mkdir(join(abs, '..'), { recursive: true })
  await writeFile(abs, content, 'utf8')
  const git = simpleGit(originDir)
  await git.add('.')
  await git.commit(`add ${rel}`)
}

export async function makeBareOrigin(): Promise<{ bareDir: string }> {
  const bareDir = await mkdtemp(join(tmpdir(), 'osnova-bare-'))
  await simpleGit(bareDir).init(['--bare', '-b', 'main'])
  const seed = await mkdtemp(join(tmpdir(), 'osnova-seed-'))
  const g = simpleGit()
  await g.clone(bareDir, seed)
  const sg = simpleGit(seed)
  await sg.addConfig('user.email', 'seed@osnova.local')
  await sg.addConfig('user.name', 'Seed')
  await writeFile(join(seed, 'doc.md'), '# Doc\n\nlinia A\nlinia B\n', 'utf8')
  await sg.add('.')
  await sg.commit('init')
  await sg.push('origin', 'main')
  return { bareDir }
}

export async function pushExternalChange(bareDir: string, file: string, content: string): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), 'osnova-ext-'))
  const g = simpleGit()
  await g.clone(bareDir, tmp)
  const sg = simpleGit(tmp)
  await sg.addConfig('user.email', 'ext@osnova.local')
  await sg.addConfig('user.name', 'Ext')
  await mkdir(join(tmp, file, '..'), { recursive: true })
  await writeFile(join(tmp, file), content, 'utf8')
  await sg.add('.')
  await sg.commit('external change')
  await sg.push('origin', 'main')
}
