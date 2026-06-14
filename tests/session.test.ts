import { beforeAll, describe, expect, it } from 'vitest'
import { createSessionToken, verifySessionToken } from '@/lib/session'

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-which-is-long-enough-123456'
})

describe('session token', () => {
  it('round-trip: create → verify', async () => {
    const token = await createSessionToken({ sub: 'kc-123', email: 'a@b.pl', name: 'Ala' })
    const data = await verifySessionToken(token)
    expect(data).toEqual({ sub: 'kc-123', email: 'a@b.pl', name: 'Ala' })
  })
  it('zmanipulowany token → null', async () => {
    const token = await createSessionToken({ sub: 'kc-123', email: 'a@b.pl' })
    expect(await verifySessionToken(token + 'x')).toBeNull()
  })
  it('wygasły token → null', async () => {
    const token = await createSessionToken({ sub: 'kc-123', email: 'a@b.pl' }, -10)
    expect(await verifySessionToken(token)).toBeNull()
  })
})
