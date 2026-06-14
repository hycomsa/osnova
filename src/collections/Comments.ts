import type { CollectionConfig } from 'payload'
import { anyLoggedIn, isSystemAdmin } from '../access'

export const Comments: CollectionConfig = {
  slug: 'comments',
  labels: { singular: 'Komentarz', plural: 'Komentarze' },
  admin: { useAsTitle: 'body', defaultColumns: ['authorEmail', 'workspace', 'path', 'status', 'kind'], group: 'Treść' },
  access: {
    read: anyLoggedIn,
    create: isSystemAdmin,
    update: isSystemAdmin,
    delete: isSystemAdmin,
  },
  fields: [
    { name: 'workspace', type: 'relationship', relationTo: 'workspaces', required: true, index: true },
    { name: 'path', type: 'text', required: true, index: true },
    { name: 'kind', type: 'select', required: true, defaultValue: 'document', options: ['inline', 'document'] },
    // kotwica (tylko inline)
    { name: 'quote', type: 'text' },
    { name: 'prefix', type: 'text' },
    { name: 'suffix', type: 'text' },
    { name: 'contextHash', type: 'text' },
    { name: 'revision', type: 'text' },
    // treść + wątek
    { name: 'body', type: 'textarea', required: true },
    { name: 'parent', type: 'relationship', relationTo: 'comments' },
    { name: 'status', type: 'select', required: true, defaultValue: 'open', options: ['open', 'resolved'] },
    // zaakceptowany do wcielenia przez AI (oznacza redaktor/ws-admin); AI bierze tylko takie komentarze
    { name: 'accepted', type: 'checkbox', defaultValue: false, label: 'Zaakceptowany do wcielenia (AI)' },
    {
      name: 'reactions',
      type: 'array',
      fields: [
        { name: 'emoji', type: 'text', required: true },
        { name: 'authorSub', type: 'text', required: true },
      ],
    },
    // autor (z Keycloak)
    { name: 'authorSub', type: 'text', required: true, index: true },
    { name: 'authorName', type: 'text' },
    { name: 'authorEmail', type: 'text' },
  ],
}
