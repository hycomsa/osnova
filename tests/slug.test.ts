import { describe, expect, it } from 'vitest'
import { slugify } from '@/lib/slug'

describe('slugify', () => {
  it('tworzy kod z nazwy (diakrytyki, spacje)', () => {
    expect(slugify('AI SDLC (test)')).toBe('ai-sdlc-test')
    expect(slugify('Wdrożenie Płatności ąęś')).toBe('wdrozenie-platnosci-aes')
  })
  it('przycina i normalizuje myślniki', () => {
    expect(slugify('  --Foo   Bar--  ')).toBe('foo-bar')
    expect(slugify('!!!')).toBe('')
  })
})
