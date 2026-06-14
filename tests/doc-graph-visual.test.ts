import { describe, expect, it } from 'vitest'
import { folderToColor, hashStringToHue } from '@/app/(frontend)/components/doc-graph/color'
import { archetypeFor } from '@/app/(frontend)/components/doc-graph/archetypes'
import { buildTree, type RawNode } from '@/app/(frontend)/components/doc-graph/graph-layout'

describe('color: hashStringToHue', () => {
  it('deterministyczny i w zakresie 0..359', () => {
    expect(hashStringToHue('foo')).toBe(hashStringToHue('foo'))
    for (const s of ['', 'x', '.ai', 'requirements/TMS']) {
      const h = hashStringToHue(s)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })
})

describe('color: folderToColor', () => {
  it('różne foldery najwyższego poziomu → różne bazowe odcienie', () => {
    expect(folderToColor('.ai/context/adrs').h).not.toBe(folderToColor('docs/skills').h)
  })
  it('rodzeństwo w tej samej rodzinie trzyma zbliżony odcień (≤36°)', () => {
    const a = folderToColor('.ai/context/adrs').h
    const b = folderToColor('.ai/context/specs').h
    const d = Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
    expect(d).toBeLessThanOrEqual(36)
  })
  it('kod obszaru (TMS/CLI) wyznacza odcień niezależnie od nadfolderu', () => {
    // ten sam obszar w różnych typach folderów → ten sam bazowy odcień (różnica tylko z ostatniego segmentu)
    const reqTms = folderToColor('.ai/context/requirements/TMS').h
    const specTms = folderToColor('.ai/context/func-specs/TMS').h
    const d = Math.min(Math.abs(reqTms - specTms), 360 - Math.abs(reqTms - specTms))
    expect(d).toBeLessThanOrEqual(30)
    // inny obszar → wyraźnie inny odcień
    expect(folderToColor('.ai/context/requirements/CLI').h).not.toBe(reqTms)
  })
  it('memoizacja zwraca ten sam obiekt', () => {
    expect(folderToColor('docs')).toBe(folderToColor('docs'))
  })
})

describe('archetypeFor', () => {
  it('centrum → quasar; doc-type → właściwy kształt; nieznany → moon', () => {
    expect(archetypeFor('func-spec', true)).toBe('quasar') // centrum zawsze quasar
    expect(archetypeFor('func-spec', false)).toBe('flagship')
    expect(archetypeFor('intent-spec', false)).toBe('saturn')
    expect(archetypeFor('requirements-notes', false)).toBe('rocky')
    expect(archetypeFor('requirements-index', false)).toBe('rocky')
    expect(archetypeFor('decision-record', false)).toBe('crystal')
    expect(archetypeFor('validation-report', false)).toBe('comet')
    expect(archetypeFor('hypothesis-backlog', false)).toBe('nebula')
    expect(archetypeFor(null, false)).toBe('moon')
    expect(archetypeFor('cos-nieznanego', false)).toBe('moon')
  })
})

describe('buildTree', () => {
  const N = (path: string, depth: number, parent: string | null, size: number, docType: string | null): RawNode =>
    ({ path, label: path, depth, parent, size, docType, folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '' })

  it('składa drzewo, przypisuje kształt/kolor/promień; większy plik → większy promień', () => {
    const nodes: RawNode[] = [
      N('a/center.md', 0, null, 1000, 'func-spec'),
      N('a/big.md', 1, 'a/center.md', 4000, 'requirements-notes'),
      N('a/small.md', 1, 'a/center.md', 200, 'intent-spec'),
      N('a/leaf.md', 2, 'a/big.md', 500, null),
    ]
    const root = buildTree(nodes)
    expect(root).not.toBeNull()
    expect(root!.archetype).toBe('quasar') // centrum
    expect(root!.children).toHaveLength(2)
    const big = root!.children.find((c) => c.path === 'a/big.md')!
    const small = root!.children.find((c) => c.path === 'a/small.md')!
    expect(big.archetype).toBe('rocky')
    expect(small.archetype).toBe('saturn')
    expect(big.radius).toBeGreaterThan(small.radius) // skala wg rozmiaru
    expect(big.children).toHaveLength(1)
    expect(big.children[0].archetype).toBe('moon')
    expect(root!.color.css).toMatch(/^hsl\(/)
  })
})
