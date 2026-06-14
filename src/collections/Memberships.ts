import type { CollectionConfig } from 'payload'
import { isSystemAdmin } from '../access'

// granularne uprawnienia (do nadpisań per użytkownik) — etykiety PL
const PERMISSION_OPTIONS = [
  { label: 'Odczyt', value: 'read' },
  { label: 'Komentowanie', value: 'comment' },
  { label: 'Zatwierdzanie', value: 'approve' },
  { label: 'Edycja (WYSIWYG)', value: 'edit-wysiwyg' },
  { label: 'Edycja źródła Markdown', value: 'edit-raw' },
  { label: 'Tworzenie stron', value: 'page-create' },
  { label: 'Usuwanie stron', value: 'page-delete' },
  { label: 'Zmiana nazwy stron', value: 'page-rename' },
  { label: 'Duplikowanie stron', value: 'page-duplicate' },
  { label: 'Podgląd właściwości', value: 'props-view' },
  { label: 'Edycja właściwości', value: 'props-edit' },
  { label: 'Historia / blame', value: 'history-view' },
  { label: 'Użycie AI', value: 'ai-use' },
]

export const Memberships: CollectionConfig = {
  slug: 'memberships',
  labels: { singular: 'Członkostwo', plural: 'Członkostwa' },
  admin: { useAsTitle: 'id', defaultColumns: ['workspace', 'user', 'roles'], group: 'Workspace’y' },
  indexes: [{ fields: ['workspace', 'user'], unique: true }],
  access: {
    read: ({ req }) => {
      if (!req.user) return false
      if (((req.user as any).globalRoles as string[] | undefined)?.includes('system_admin')) return true
      return { user: { equals: req.user.id } }
    },
    create: isSystemAdmin,
    update: isSystemAdmin,
    delete: isSystemAdmin,
  },
  fields: [
    { name: 'workspace', type: 'relationship', relationTo: 'workspaces', label: 'Workspace', required: true, index: true },
    { name: 'user', type: 'relationship', relationTo: 'users', label: 'Użytkownik', required: true, index: true },
    {
      name: 'roles',
      type: 'select',
      label: 'Role',
      hasMany: true,
      required: true,
      options: [
        { label: 'Opiekun workspace', value: 'workspace_maintainer' },
        { label: 'Edytor', value: 'editor' },
        { label: 'Klient — techniczny', value: 'client_technical' },
        { label: 'Klient — biznesowy', value: 'client_business' },
        { label: 'Obserwator', value: 'viewer' },
      ],
    },
    // Granularne nadpisania per użytkownik (na bazie ról). Efektywne = role ∪ nadane − odebrane.
    {
      name: 'grantedPermissions', type: 'select', hasMany: true, label: 'Dodatkowo nadane uprawnienia',
      admin: { description: 'Uprawnienia przyznane ponad domyślne wynikające z ról.' },
      options: PERMISSION_OPTIONS,
    },
    {
      name: 'revokedPermissions', type: 'select', hasMany: true, label: 'Odebrane uprawnienia',
      admin: { description: 'Uprawnienia odebrane mimo że wynikają z ról.' },
      options: PERMISSION_OPTIONS,
    },
    {
      name: 'viewAccess', type: 'select', hasMany: true, label: 'Dostęp do widoków (override)',
      admin: { description: 'Jeśli ustawione, zastępuje widoki wynikające z ról. Widok bezpośredni i tak tylko dla ról dostawcy/admina.' },
      options: [
        { label: 'Bezpośredni (1:1)', value: 'direct' },
        { label: 'Kliencki — biznesowy', value: 'client_business' },
        { label: 'Kliencki — techniczny', value: 'client_technical' },
      ],
    },
  ],
}
