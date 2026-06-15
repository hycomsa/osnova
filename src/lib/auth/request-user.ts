import type { NextRequest } from 'next/server'
import type { Payload } from 'payload'
import { SESSION_COOKIE, verifySessionToken } from '../session'
import { authMode, proxyConfig } from './mode'
import { resolveProxyIdentity } from './proxy'
import { upsertUser } from './provision'

export interface AppUser {
  id: string | number
  email: string
  name?: string | null
  globalRoles?: string[] | null
}

export async function getRequestUser(req: NextRequest, payload: Payload): Promise<AppUser | null> {
  // Proxy mode: trust the reverse-proxy identity header; find-or-create the user.
  if (authMode() === 'proxy') {
    const id = resolveProxyIdentity(req.headers)
    if (id) return upsertUser(payload, id)
    // No header — fall back to the OIDC session cookie only if enabled; else unauthenticated.
    if (!proxyConfig().oidcFallback) return null
  }

  // OIDC mode (or proxy + OIDC fallback): identity comes from the signed session cookie.
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await verifySessionToken(token)
  if (!session) return null
  const found = await payload.find({
    collection: 'users',
    where: { keycloakSub: { equals: session.sub } },
    limit: 1,
    overrideAccess: true,
  })
  return (found.docs[0] as AppUser | undefined) ?? null
}
