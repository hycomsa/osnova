import type { NextRequest } from 'next/server'
import type { Payload } from 'payload'
import { SESSION_COOKIE, verifySessionToken } from '../session'

export interface AppUser {
  id: string | number
  email: string
  name?: string | null
  globalRoles?: string[] | null
}

export async function getRequestUser(req: NextRequest, payload: Payload): Promise<AppUser | null> {
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
