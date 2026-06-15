import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { md5 } from '@/lib/md5'
import { avatarUrlFor } from '@/lib/avatar'

describe('md5', () => {
  it('matches known RFC 1321 / common vectors', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6')
    expect(md5('test@example.com')).toBe('55502f40dc8b7c769880b10874abc9d0')
  })
})

describe('avatarUrlFor', () => {
  const key = 'NEXT_PUBLIC_AVATAR_URL_TEMPLATE'
  let saved: string | undefined
  beforeEach(() => { saved = process.env[key]; delete process.env[key] })
  afterEach(() => { if (saved === undefined) delete process.env[key]; else process.env[key] = saved })

  it('returns null when no template configured', () => {
    expect(avatarUrlFor('a@b.pl')).toBeNull()
  })

  it('returns null when no email', () => {
    process.env[key] = 'https://av.example.com/avatar/{size}/{hash}.jpg'
    expect(avatarUrlFor('')).toBeNull()
    expect(avatarUrlFor(null)).toBeNull()
  })

  it('substitutes {hash} (md5 of lowercased email) and {size}', () => {
    process.env[key] = 'https://av.example.com/avatar/{size}/{hash}.jpg'
    expect(avatarUrlFor('Test@Example.com', 96)).toBe(
      'https://av.example.com/avatar/96/55502f40dc8b7c769880b10874abc9d0.jpg',
    )
  })
})
