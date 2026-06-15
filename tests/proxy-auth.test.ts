import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveProxyIdentity } from '@/lib/auth/proxy'
import { computeGlobalRoles, upsertUser } from '@/lib/auth/provision'
import { authMode, oidcLoginAvailable } from '@/lib/auth/mode'

const ENV_KEYS = [
  'PROXY_AUTH_HEADER', 'PROXY_AUTH_NAME_HEADER', 'PROXY_AUTH_SECRET_HEADER',
  'PROXY_AUTH_SHARED_SECRET', 'PROXY_AUTH_DEV_USER', 'ADMIN_EMAILS', 'NODE_ENV',
  'AUTH_MODE', 'PROXY_AUTH_OIDC_FALLBACK', 'KEYCLOAK_ISSUER',
] as const
let saved: Record<string, string | undefined>
const env = process.env as Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, env[k]]))
  for (const k of ENV_KEYS) delete env[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete env[k]
    else env[k] = saved[k]
  }
})

const H = (o: Record<string, string>) => new Headers(o)

describe('resolveProxyIdentity', () => {
  it('reads the default X-User-UPN header → identity (email lowercased, name derived)', () => {
    const id = resolveProxyIdentity(H({ 'X-User-UPN': 'Jan.Kowalski@Klient.PL' }))
    expect(id).toEqual({ subject: 'jan.kowalski@klient.pl', email: 'jan.kowalski@klient.pl', name: 'Jan Kowalski' })
  })

  it('uses the configured name header when present', () => {
    process.env.PROXY_AUTH_NAME_HEADER = 'X-User-Name'
    const id = resolveProxyIdentity(H({ 'X-User-UPN': 'a@b.pl', 'X-User-Name': 'Anna Nowak' }))
    expect(id?.name).toBe('Anna Nowak')
  })

  it('honours a custom header name', () => {
    process.env.PROXY_AUTH_HEADER = 'X-Forwarded-Email'
    expect(resolveProxyIdentity(H({ 'X-Forwarded-Email': 'c@x.pl' }))?.email).toBe('c@x.pl')
    expect(resolveProxyIdentity(H({ 'X-User-UPN': 'c@x.pl' }))).toBeNull()
  })

  it('missing header in production → null', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production'
    process.env.PROXY_AUTH_DEV_USER = 'dev@x.pl' // ignored in production
    expect(resolveProxyIdentity(H({}))).toBeNull()
  })

  it('missing header + dev user (non-production) → dev identity', () => {
    (process.env as Record<string, string>).NODE_ENV = 'development'
    process.env.PROXY_AUTH_DEV_USER = 'dev@x.pl'
    expect(resolveProxyIdentity(H({}))?.email).toBe('dev@x.pl')
  })

  it('non-email header value → null', () => {
    expect(resolveProxyIdentity(H({ 'X-User-UPN': 'not-an-email' }))).toBeNull()
  })

  it('shared secret: rejects when missing/wrong, accepts when matching', () => {
    process.env.PROXY_AUTH_SHARED_SECRET = 's3cr3t'
    expect(resolveProxyIdentity(H({ 'X-User-UPN': 'a@b.pl' }))).toBeNull()
    expect(resolveProxyIdentity(H({ 'X-User-UPN': 'a@b.pl', 'X-Proxy-Secret': 'nope' }))).toBeNull()
    expect(resolveProxyIdentity(H({ 'X-User-UPN': 'a@b.pl', 'X-Proxy-Secret': 's3cr3t' }))?.email).toBe('a@b.pl')
  })
})

describe('auth mode + OIDC fallback', () => {
  it('defaults to proxy mode; oidc when AUTH_MODE=oidc', () => {
    expect(authMode()).toBe('proxy')
    process.env.AUTH_MODE = 'oidc'
    expect(authMode()).toBe('oidc')
  })

  it('oidcLoginAvailable: needs an issuer in proxy mode; fallback defaults on; oidc always true', () => {
    // proxy + fallback default(on) but NO issuer → not available (no broken button)
    expect(oidcLoginAvailable()).toBe(false)
    // proxy + issuer + fallback default(on) → available
    process.env.KEYCLOAK_ISSUER = 'https://auth.example.com/realms/osnova'
    expect(oidcLoginAvailable()).toBe(true)
    // explicit opt-out → not available
    process.env.PROXY_AUTH_OIDC_FALLBACK = 'false'
    expect(oidcLoginAvailable()).toBe(false)
    // oidc mode → always available
    process.env.AUTH_MODE = 'oidc'
    expect(oidcLoginAvailable()).toBe(true)
  })
})

describe('computeGlobalRoles', () => {
  it('grants system_admin only to ADMIN_EMAILS (case-insensitive)', () => {
    process.env.ADMIN_EMAILS = 'boss@x.pl, admin@x.pl'
    expect(computeGlobalRoles('ADMIN@x.pl')).toEqual(['system_admin'])
    expect(computeGlobalRoles('user@x.pl')).toEqual([])
  })
})

// Minimal Payload stub tracking users by subject.
function stubPayload() {
  const users: any[] = []
  let seq = 0
  return {
    creates: 0,
    updates: 0,
    find: async ({ where }: any) => {
      const s = where?.subject?.equals
      return { docs: users.filter((u) => u.subject === s) }
    },
    create: async function (this: any, { data }: any) {
      this.creates++
      const doc = { id: ++seq, ...data }
      users.push(doc)
      return doc
    },
    update: async function (this: any, { id, data }: any) {
      this.updates++
      const doc = users.find((u) => u.id === id)
      Object.assign(doc, data)
      return doc
    },
  } as any
}

describe('upsertUser', () => {
  it('creates on first sight (admin email → system_admin), reuses without writing, updates on drift', async () => {
    process.env.ADMIN_EMAILS = 'admin@x.pl'
    const p = stubPayload()

    const a = await upsertUser(p, { subject: 'admin@x.pl', email: 'admin@x.pl', name: 'Admin' })
    expect(a.id).toBeTruthy()
    expect(a.globalRoles).toEqual(['system_admin'])
    expect(p.creates).toBe(1)

    // same identity, unchanged → no write
    const b = await upsertUser(p, { subject: 'admin@x.pl', email: 'admin@x.pl', name: 'Admin' })
    expect(b.id).toBe(a.id)
    expect(p.creates).toBe(1)
    expect(p.updates).toBe(0)

    // name drift → one update, same row
    const c = await upsertUser(p, { subject: 'admin@x.pl', email: 'admin@x.pl', name: 'Admin Renamed' })
    expect(c.id).toBe(a.id)
    expect(c.name).toBe('Admin Renamed')
    expect(p.updates).toBe(1)
  })
})
