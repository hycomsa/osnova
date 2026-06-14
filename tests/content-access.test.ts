import { describe, expect, it } from 'vitest'
import { filterTree, isPathAllowed, isReadable } from '@/lib/content-access'
import { UNDERSCORE_EXCLUDES, type ViewRules } from '@/lib/view-rules'

const RULES: ViewRules = {
  include: ['README.md', 'docs/business/**'],
  exclude: ['docs/business/internal/**'],
}

describe('content-access', () => {
  it('przepuszcza ścieżki z include', () => {
    expect(isPathAllowed('README.md', RULES)).toBe(true)
    expect(isPathAllowed('docs/business/plan.md', RULES)).toBe(true)
  })
  it('odrzuca ścieżki spoza include', () => {
    expect(isPathAllowed('docs/adr/adr-1.md', RULES)).toBe(false)
    expect(isPathAllowed('secret.md', RULES)).toBe(false)
  })
  it('exclude wygrywa z include', () => {
    expect(isPathAllowed('docs/business/internal/notes.md', RULES)).toBe(false)
  })
  it('pusty include = nic (fail-closed)', () => {
    expect(isPathAllowed('README.md', { include: [], exclude: [] })).toBe(false)
  })
  it('path traversal odrzucony', () => {
    expect(isPathAllowed('../etc/passwd', { include: ['**'], exclude: [] })).toBe(false)
    expect(isPathAllowed('docs/../../x.md', { include: ['**'], exclude: [] })).toBe(false)
  })
  it('filterTree zwraca wyłącznie dozwolone', () => {
    const all = [
      'README.md',
      'docs/business/plan.md',
      'docs/business/internal/notes.md',
      'docs/adr/adr-1.md',
    ]
    expect(filterTree(all, RULES)).toEqual(['README.md', 'docs/business/plan.md'])
  })
  it("'**' obejmuje pliki/katalogi z kropką (np. .ai/context)", () => {
    const full = { include: ['**'], exclude: [] }
    expect(isPathAllowed('.ai/context/state.md', full)).toBe(true)
    expect(isPathAllowed('.agents/skills/x.md', full)).toBe(true)
    expect(isPathAllowed('.docs.config.yaml', full)).toBe(true)
  })
  it('globy z literalnym prefiksem .ai działają; exclude pod kropką też', () => {
    const r = { include: ['.ai/context/**'], exclude: ['.ai/context/_input/**'] }
    expect(isPathAllowed('.ai/context/func-specs/x.md', r)).toBe(true)
    expect(isPathAllowed('.ai/context/_input/transkrypcja.md', r)).toBe(false)
    expect(isPathAllowed('README.md', r)).toBe(false)
  })

  describe('isReadable — osadzone zasoby w katalogach „_"', () => {
    // widok kliencki: include obejmuje obszar, ale reguła podkreślnika ukrywa „_*"
    const client: ViewRules = { include: ['.ai/context/requirements/**'], exclude: [...UNDERSCORE_EXCLUDES] }
    it('obrazek pod „_notes" w objętym obszarze → czytelny (mimo reguły podkreślnika)', () => {
      const img = '.ai/context/requirements/APP/_notes/assets/geofencing.svg'
      expect(isPathAllowed(img, client)).toBe(false) // normalnie wykluczony
      expect(isReadable(img, client)).toBe(true) // ale serwowany jako zasób
    })
    it('markdown pod „_notes" pozostaje ukryty', () => {
      expect(isReadable('.ai/context/requirements/APP/_notes/tajne.md', client)).toBe(false)
    })
    it('obrazek spoza obszaru include → nieczytelny', () => {
      expect(isReadable('.agents/_x/logo.png', client)).toBe(false)
    })
    it('obrazek pod jawnym (nie-podkreślnikowym) wykluczeniem → nieczytelny', () => {
      const r: ViewRules = { include: ['.ai/context/**'], exclude: ['.ai/context/secret/**'] }
      expect(isReadable('.ai/context/secret/diagram.png', r)).toBe(false)
    })
  })
})
