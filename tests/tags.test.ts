import { describe, expect, it } from 'vitest'
import { extractTags, parseFrontmatter } from '@/lib/frontmatter'

describe('frontmatter tags', () => {
  it('parsuje tags jako listę', () => {
    const fm = parseFrontmatter('---\ntitle: X\ntags:\n  - alfa\n  - beta\n---\n# Treść\n')
    expect(extractTags(fm)).toEqual(['alfa', 'beta'])
  })
  it('parsuje tags jako string CSV', () => {
    expect(extractTags(parseFrontmatter('---\ntags: alfa, beta ,gamma\n---\nx'))).toEqual(['alfa', 'beta', 'gamma'])
  })
  it('brak frontmatter / brak tagów → []', () => {
    expect(extractTags(parseFrontmatter('# Bez frontmatter\n'))).toEqual([])
    expect(extractTags(parseFrontmatter('---\ntitle: X\n---\nx'))).toEqual([])
  })
  it('zepsuty frontmatter → {} (bez wyjątku)', () => {
    expect(parseFrontmatter('---\ntags: [unclosed\n---\nx')).toEqual({})
  })
})
