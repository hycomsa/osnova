import type { CollectionConfig } from 'payload'
import { isSystemAdmin } from '../access'

// Ulubione strony użytkownika (per workspace). Prywatne dla właściciela; tworzone serwerowo (overrideAccess).
export const Favorites: CollectionConfig = {
  slug: 'favorites',
  labels: { singular: 'Ulubione', plural: 'Ulubione' },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['user', 'workspace', 'path', 'createdAt'],
    group: 'Treść',
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return false
      if (((req.user as any).globalRoles as string[] | undefined)?.includes('system_admin')) return true
      return { user: { equals: req.user.id } }
    },
    create: isSystemAdmin,
    update: isSystemAdmin,
    delete: ({ req }) => {
      if (!req.user) return false
      if (((req.user as any).globalRoles as string[] | undefined)?.includes('system_admin')) return true
      return { user: { equals: req.user.id } }
    },
  },
  indexes: [{ fields: ['user', 'workspace', 'path'], unique: true }],
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', label: 'Użytkownik', required: true, index: true },
    { name: 'workspace', type: 'relationship', relationTo: 'workspaces', label: 'Workspace', required: true, index: true },
    { name: 'view', type: 'text', label: 'Widok (kontekst dodania)' },
    { name: 'path', type: 'text', label: 'Ścieżka', required: true },
    { name: 'label', type: 'text', label: 'Etykieta' },
  ],
}
