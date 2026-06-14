import { describe, expect, it } from 'vitest'
import { filterTree, isPathAllowed } from '@/lib/content-access'
import type { ViewRules } from '@/lib/view-rules'

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
})
