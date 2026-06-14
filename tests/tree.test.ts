import { describe, expect, it } from 'vitest'
import { indexNodesByPath, pickRecent, resolveFavorites, type TreeNodeLike } from '../src/lib/tree'

const NODES: TreeNodeLike[] = [
  { type: 'section', id: 's1', label: 'Wymagania', children: [
    { type: 'folder', id: 'f1', label: 'APP', children: [
      { type: 'file', id: 'n1', label: 'Logowanie', path: 'wymagania/APP/login.md' },
      { type: 'file', id: 'n2', label: 'Rejestracja', path: 'wymagania/APP/signup.md' },
    ] },
    { type: 'bundle', id: 'b1', label: 'Specyfikacja X', primaryFile: 'specs/x/index.md', tabs: [], children: [] } as any,
  ] },
]

describe('indexNodesByPath', () => {
  it('mapuje pliki i bundle (primaryFile) na etykiety', () => {
    const idx = indexNodesByPath(NODES)
    expect(idx.get('wymagania/APP/login.md')).toBe('Logowanie')
    expect(idx.get('wymagania/APP/signup.md')).toBe('Rejestracja')
    expect(idx.get('specs/x/index.md')).toBe('Specyfikacja X')
    expect(idx.size).toBe(3)
  })
})

describe('pickRecent', () => {
  const idx = indexNodesByPath(NODES)
  it('zachowuje kolejność, usuwa duplikaty, tnie do limitu', () => {
    const r = pickRecent(['wymagania/APP/signup.md', 'wymagania/APP/login.md', 'wymagania/APP/signup.md'], idx, 6)
    expect(r.map((e) => e.path)).toEqual(['wymagania/APP/signup.md', 'wymagania/APP/login.md'])
    expect(r[0].label).toBe('Rejestracja')
  })
  it('dla ścieżki spoza drzewa używa nazwy pliku bez rozszerzenia', () => {
    const r = pickRecent(['inne/notatka.md'], idx)
    expect(r[0]).toEqual({ path: 'inne/notatka.md', label: 'notatka' })
  })
  it('respektuje limit', () => {
    const r = pickRecent(['a.md', 'b.md', 'c.md', 'd.md'], idx, 2)
    expect(r).toHaveLength(2)
  })
})

describe('resolveFavorites', () => {
  const idx = indexNodesByPath(NODES)
  it('preferuje etykietę z drzewa, potem zapisaną, potem nazwę pliku', () => {
    const r = resolveFavorites([
      { path: 'wymagania/APP/login.md', label: 'stara etykieta' },
      { path: 'poza/drzewem.md', label: 'Zapisana' },
      { path: 'bez/etykiety.md' },
    ], idx)
    expect(r[0].label).toBe('Logowanie') // z drzewa
    expect(r[1].label).toBe('Zapisana') // zapisana
    expect(r[2].label).toBe('etykiety') // nazwa pliku
  })
  it('usuwa duplikaty ścieżek', () => {
    const r = resolveFavorites([{ path: 'x.md' }, { path: 'x.md' }], idx)
    expect(r).toHaveLength(1)
  })
})
