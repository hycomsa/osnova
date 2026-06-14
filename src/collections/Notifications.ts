import type { CollectionConfig } from 'payload'
import { isSystemAdmin } from '../access'

// Powiadomienia użytkownika (np. @wzmianki w komentarzach). Tworzone serwerowo (overrideAccess).
export const Notifications: CollectionConfig = {
  slug: 'notifications',
  labels: { singular: 'Powiadomienie', plural: 'Powiadomienia' },
  admin: {
    useAsTitle: 'excerpt',
    defaultColumns: ['recipient', 'type', 'path', 'read', 'createdAt'],
    group: 'Treść',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return false
      if (((req.user as any).globalRoles as string[] | undefined)?.includes('system_admin')) return true
      return { recipient: { equals: req.user.id } }
    },
    update: ({ req }) => {
      if (!req.user) return false
      if (((req.user as any).globalRoles as string[] | undefined)?.includes('system_admin')) return true
      return { recipient: { equals: req.user.id } }
    },
    create: isSystemAdmin,
    delete: isSystemAdmin,
  },
  fields: [
    { name: 'recipient', type: 'relationship', relationTo: 'users', label: 'Odbiorca', required: true, index: true },
    { name: 'type', type: 'select', required: true, defaultValue: 'mention', options: [{ label: 'Wzmianka', value: 'mention' }, { label: 'Odpowiedź w wątku', value: 'reply' }, { label: 'Akceptacja', value: 'approval' }, { label: 'Zatwierdzenie', value: 'approval_approved' }, { label: 'Prośba o zmiany', value: 'approval_changes' }] },
    { name: 'workspace', type: 'relationship', relationTo: 'workspaces', label: 'Workspace' },
    { name: 'view', type: 'text' },
    { name: 'path', type: 'text' },
    { name: 'commentId', type: 'text' },
    { name: 'actorName', type: 'text' },
    { name: 'actorEmail', type: 'text' },
    { name: 'excerpt', type: 'text' },
    { name: 'read', type: 'checkbox', defaultValue: false, index: true },
  ],
}
