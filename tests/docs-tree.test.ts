import { describe, expect, it } from 'vitest'
import { buildDocsTree, parseDocsSections, type TreeNode } from '@/lib/docs-tree'

const YAML = `
root_path: .ai/context
sections:
  - key: overview
    label: Przegląd
    path: .
    index_file: state.md
  - key: intent_specs
    label: Intencje
    path: intent-specs
    explorer:
      layout: bundle_folders
      bundle_dir_prefix: INT-
      primary_file: intent.md
      tabs:
        - { file: intent.md, label: Intencja }
        - { file: evidence.md, label: Dowody }
  - key: func_specs
    label: Specyfikacje funkcjonalne
    path: func-specs
    explorer:
      layout: bundle_folders
      bundle_dir_prefix: FUNC-
      primary_file: func-spec.md
      bundle_nested_stacks: true
      tabs:
        - { file: func-spec.md, label: Spec }
        - { file: technical.md, label: Tech }
  - key: adrs
    label: ADR
    path: adrs
    explorer: { layout: adr_flat }
  - key: requirements
    label: Wymagania
    path: requirements
`
const FILES = [
  '.ai/context/state.md',
  '.ai/context/README.md',
  '.ai/context/intent-specs/INT-COMP-x/intent.md',
  '.ai/context/intent-specs/INT-COMP-x/evidence.md',
  '.ai/context/func-specs/APP/FUNC-APP-cargo/func-spec.md',
  '.ai/context/func-specs/APP/FUNC-APP-cargo/technical.md',
  '.ai/context/adrs/ADR-001-stack.md',
  '.ai/context/adrs/ADR-002-ui.md',
  '.ai/context/requirements/requirements-list.md',
  '.ai/context/requirements/COMP/REQ-COMP-01.md',
]
const find = (nodes: TreeNode[], label: string) => nodes.find((n) => n.label === label)

describe('buildDocsTree', () => {
  const cfg = parseDocsSections(YAML)!
  const tree = buildDocsTree(FILES, cfg)

  it('parsuje sekcje', () => {
    expect(cfg.rootPath).toBe('.ai/context')
    expect(cfg.sections.map((s) => s.key)).toContain('func_specs')
  })
  it('overview łapie pliki z roota', () => {
    const ov = find(tree, 'Przegląd')!
    expect(ov.type).toBe('section')
    expect(ov.children!.map((c) => c.label).sort()).toEqual(['README.md', 'state.md'])
  })
  it('intent-specs: bundle INT- z primary + tabs', () => {
    const sec = find(tree, 'Intencje')!
    const bundle = sec.children![0]
    expect(bundle.type).toBe('bundle')
    expect(bundle.label).toBe('INT-COMP-x')
    expect(bundle.primaryFile).toBe('.ai/context/intent-specs/INT-COMP-x/intent.md')
    expect(bundle.tabs!.map((t) => t.label)).toEqual(['Intencja', 'Dowody'])
  })
  it('func-specs: bundle_nested_stacks zachowuje katalog-obszar (APP → FUNC-…)', () => {
    const sec = find(tree, 'Specyfikacje funkcjonalne')!
    const appFolder = sec.children!.find((c) => c.type === 'folder' && c.label === 'APP')!
    expect(appFolder).toBeTruthy()
    const bundle = appFolder.children!.find((c) => c.type === 'bundle')!
    expect(bundle.label).toBe('FUNC-APP-cargo')
    expect(bundle.primaryFile).toContain('func-spec.md')
  })
  it('intent-specs: bez nested_stacks bundle leży płasko w sekcji', () => {
    const sec = find(tree, 'Intencje')!
    expect(sec.children!.every((c) => c.type === 'bundle')).toBe(true)
  })
  it('adrs: adr_flat = pliki', () => {
    const sec = find(tree, 'ADR')!
    expect(sec.children!.every((c) => c.type === 'file')).toBe(true)
    expect(sec.children!.map((c) => c.label)).toEqual(['ADR-001-stack.md', 'ADR-002-ui.md'])
  })
  it('requirements: tree (folder COMP + plik)', () => {
    const sec = find(tree, 'Wymagania')!
    const folder = sec.children!.find((c) => c.type === 'folder')
    expect(folder?.label).toBe('COMP')
    expect(sec.children!.some((c) => c.type === 'file' && c.label === 'requirements-list.md')).toBe(true)
  })
  it('sekcje bez plików pominięte; brak configu → płaski tree', () => {
    const plain = buildDocsTree(['a/b.md', 'a/c.md', 'd.md'], null)
    expect(find(plain, 'a')?.type).toBe('folder')
    expect(find(plain, 'd.md')?.type).toBe('file')
  })
})
