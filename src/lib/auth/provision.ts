import type { Payload } from 'payload'
import type { AppUser } from './request-user'

// Federated identity provisioning, shared by both auth modes (proxy header + OIDC callback).
// The Osnova `users` row is keyed on a stable subject string, persisted in the legacy
// `keycloakSub` column (kept for backward compatibility — no DB migration):
//   - proxy mode: subject = the user's email (from the trusted header)
//   - oidc mode:  subject = the OIDC `sub` claim

export interface Identity {
  subject: string
  email: string
  name?: string | null
}

// Emails listed in ADMIN_EMAILS receive the global `system_admin` role (both modes).
export function computeGlobalRoles(email: string): 'system_admin'[] {
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(email.trim().toLowerCase()) ? ['system_admin'] : []
}

// Find-or-create the user by `subject`. Updates email/name/globalRoles only when they drift,
// so the hot path (returning visitor in proxy mode) avoids a write on every request.
export async function upsertUser(payload: Payload, id: Identity): Promise<AppUser> {
  const email = id.email.trim()
  const name = id.name ?? undefined
  const globalRoles = computeGlobalRoles(email)

  const existing = await payload.find({
    collection: 'users',
    where: { keycloakSub: { equals: id.subject } },
    limit: 1,
    overrideAccess: true,
  })
  const doc = existing.docs[0] as any | undefined

  if (doc) {
    const rolesNow = Array.isArray(doc.globalRoles) ? doc.globalRoles : []
    const drifted =
      doc.email !== email ||
      (doc.name ?? undefined) !== name ||
      rolesNow.join(',') !== globalRoles.join(',')
    if (drifted) {
      const updated = await payload.update({
        collection: 'users',
        id: doc.id,
        data: { email, name, globalRoles },
        overrideAccess: true,
      })
      return updated as AppUser
    }
    return doc as AppUser
  }

  const created = await payload.create({
    collection: 'users',
    data: { keycloakSub: id.subject, email, name, globalRoles },
    overrideAccess: true,
  })
  return created as AppUser
}
