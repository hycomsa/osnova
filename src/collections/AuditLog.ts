import type { CollectionConfig } from 'payload'
import { isSystemAdmin } from '../access'

// Dziennik audytu: zdarzenia bezpieczeństwa i kluczowe akcje (model bezpieczeństwa PRD +
// instrumentacja metryk). Tworzony wyłącznie serwerowo (overrideAccess), czytelny tylko dla
// administratora systemu. Append-only: brak edycji/usuwania z UI.
export const AUDIT_ACTIONS = [
  'access-denied',
  'document-opened',
  'commit-pushed',
  'comment-created',
  'file-created',
  'file-deleted',
  'file-renamed',
  'file-duplicated',
  'file-restored',
  'properties-changed',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AuditLog: CollectionConfig = {
  slug: 'audit-log',
  labels: { singular: 'Wpis audytu', plural: 'Dziennik audytu' },
  admin: {
    useAsTitle: 'action',
    defaultColumns: ['action', 'userEmail', 'workspace', 'view', 'path', 'createdAt'],
    group: 'System',
  },
  access: {
    read: isSystemAdmin,
    create: isSystemAdmin, // pisane przez backend z overrideAccess
    update: () => false,
    delete: isSystemAdmin,
  },
  indexes: [
    { fields: ['workspace', 'action'] },
    { fields: ['userId'] },
  ],
  fields: [
    { name: 'action', type: 'select', required: true, options: AUDIT_ACTIONS.map((a) => ({ label: a, value: a })), index: true },
    { name: 'workspace', type: 'relationship', relationTo: 'workspaces', index: true },
    { name: 'userId', type: 'text', label: 'ID użytkownika', index: true },
    { name: 'userEmail', type: 'text', label: 'E-mail użytkownika' },
    { name: 'view', type: 'text', label: 'Widok' },
    { name: 'path', type: 'text', label: 'Ścieżka' },
    { name: 'detail', type: 'text', label: 'Szczegóły' },
  ],
}
