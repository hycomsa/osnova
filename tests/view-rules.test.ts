import { describe, expect, it } from 'vitest'
import { isPathAllowed } from '@/lib/content-access'
import { parseDocsConfig, resolveViewRules } from '@/lib/view-rules'

const YAML = `
views:
  client_business:
    include:
      - "README.md"
      - "intencje/**"
    exclude:
      - "intencje/wewnetrzne/**"
  client_technical:
    include:
      - "**"
`

describe('view rules (hybryda)', () => {
  it('direct zawsze pełny (gate na roli, nie regułach)', () => {
    expect(resolveViewRules({ view: 'direct' })).toEqual({ include: ['**'], exclude: [] })
  })
  it('widok kliencki bez reguł = pusty (fail-closed)', () => {
    expect(resolveViewRules({ view: 'client_business' })).toEqual({ include: [], exclude: [] })
  })
  it('direct jest konfigurowalny — override zawęża pełny widok', () => {
    const rules = resolveViewRules({ view: 'direct', override: { include: ['docs/**'], exclude: [] }, source: 'osnova' })
    expect(rules.include).toEqual(['docs/**'])
  })
  it('direct domyślnie nie ukrywa katalogów „_"', () => {
    expect(resolveViewRules({ view: 'direct' }).exclude).not.toContain('**/_*/**')
  })
  it('czyta reguły z .docs.config.yaml', () => {
    const cfg = parseDocsConfig(YAML)
    expect(resolveViewRules({ view: 'client_business', docsConfig: cfg, hideUnderscored: false })).toEqual({
      include: ['README.md', 'intencje/**'],
      exclude: ['intencje/wewnetrzne/**'],
    })
  })
  it('hybryda: override z Osnovy wygrywa nad plikiem', () => {
    const cfg = parseDocsConfig(YAML)
    const rules = resolveViewRules({
      view: 'client_business',
      docsConfig: cfg,
      override: { include: ['specyfikacje/**'], exclude: [] },
      source: 'hybrid',
      hideUnderscored: false,
    })
    expect(rules).toEqual({ include: ['specyfikacje/**'], exclude: [] })
  })
  it("source='osnova' ignoruje plik nawet bez override (fail-closed)", () => {
    const cfg = parseDocsConfig(YAML)
    expect(resolveViewRules({ view: 'client_business', docsConfig: cfg, source: 'osnova' })).toEqual({
      include: [],
      exclude: [],
    })
  })
  it('zepsuty YAML → pusta konfiguracja (fail-closed)', () => {
    expect(parseDocsConfig('views: [unclosed')).toEqual({})
  })

  describe('ukrywanie katalogów „_" (hideUnderscored)', () => {
    const cfg = parseDocsConfig(`
views:
  client_business:
    include: ["**"]
`)
    it('domyślnie włączone dla widoku klienckiego → dokłada wykluczenia „_"', () => {
      const rules = resolveViewRules({ view: 'client_business', docsConfig: cfg })
      expect(rules.exclude).toContain('_*/**')
      expect(rules.exclude).toContain('**/_*/**')
      expect(isPathAllowed('requirements/_input/dane.md', rules)).toBe(false)
      expect(isPathAllowed('_input/x.md', rules)).toBe(false)
      expect(isPathAllowed('.ai/context/_input/z.md', rules)).toBe(false)
      expect(isPathAllowed('requirements/input/ok.md', rules)).toBe(true)
      expect(isPathAllowed('README.md', rules)).toBe(true)
    })
    it('hideUnderscored=false → nie dokłada wykluczeń', () => {
      const rules = resolveViewRules({ view: 'client_business', docsConfig: cfg, hideUnderscored: false })
      expect(rules.exclude).not.toContain('**/_*/**')
      expect(isPathAllowed('_input/x.md', rules)).toBe(true)
    })
    it('hint hide_underscored:false z .docs.config.yaml respektowany', () => {
      const cfg2 = parseDocsConfig(`
views:
  client_technical:
    include: ["**"]
    hide_underscored: false
`)
      const rules = resolveViewRules({ view: 'client_technical', docsConfig: cfg2 })
      expect(rules.exclude).not.toContain('**/_*/**')
    })
    it('direct nigdy nie ukrywa (pełny 1:1)', () => {
      const rules = resolveViewRules({ view: 'direct' })
      expect(isPathAllowed('_input/x.md', rules)).toBe(true)
    })
  })
})
