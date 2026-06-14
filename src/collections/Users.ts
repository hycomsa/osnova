import type { CollectionConfig } from 'payload'
import { anyLoggedIn, isSystemAdmin } from '../access'
import { SESSION_COOKIE, verifySessionToken } from '../lib/session'

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    disableLocalStrategy: true,
    strategies: [
      {
        name: 'keycloak-session',
        authenticate: async ({ payload, headers }) => {
          const cookies = parseCookies(headers.get('cookie'))
          const token = cookies[SESSION_COOKIE]
          if (!token) return { user: null }
          const session = await verifySessionToken(token)
          if (!session) return { user: null }
          const found = await payload.find({
            collection: 'users',
            where: { keycloakSub: { equals: session.sub } },
            limit: 1,
            overrideAccess: true,
          })
          const doc = found.docs[0]
          if (!doc) return { user: null }
          return { user: { ...doc, collection: 'users' } as any }
        },
      },
    ],
  },
  labels: { singular: 'Użytkownik', plural: 'Użytkownicy' },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'globalRoles'], group: 'System' },
  access: {
    read: anyLoggedIn,
    create: isSystemAdmin,
    update: isSystemAdmin,
    delete: isSystemAdmin,
  },
  fields: [
    { name: 'keycloakSub', type: 'text', label: 'Keycloak sub', required: true, unique: true, index: true, admin: { description: 'Identyfikator użytkownika z Keycloak (claim „sub").' } },
    { name: 'email', type: 'email', label: 'E-mail', required: true },
    { name: 'name', type: 'text', label: 'Imię i nazwisko' },
    {
      name: 'locale',
      type: 'select',
      label: 'Język interfejsu',
      options: [{ label: 'Polski', value: 'pl' }, { label: 'English', value: 'en' }, { label: 'Deutsch', value: 'de' }],
    },
    {
      name: 'emailDigest',
      type: 'select',
      label: 'Podsumowania e-mail',
      defaultValue: 'daily',
      options: [
        { label: 'Wyłączone', value: 'none' },
        { label: 'Codziennie', value: 'daily' },
        { label: 'Co tydzień', value: 'weekly' },
      ],
      admin: { description: 'Częstotliwość zbiorczych powiadomień e-mail o nieprzeczytanych zdarzeniach.' },
    },
    { name: 'lastDigestAt', type: 'date', label: 'Ostatnie podsumowanie', admin: { readOnly: true, position: 'sidebar' } },
    {
      name: 'globalRoles',
      type: 'select',
      label: 'Role globalne',
      hasMany: true,
      options: [{ label: 'Administrator systemu', value: 'system_admin' }],
    },
  ],
}
