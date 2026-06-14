import type { CollectionConfig } from 'payload'
import { anyLoggedIn, isSystemAdmin } from '../access'

// „Skille" AI (presety promptów) do wcielania/refiningu komentarzy.
// workspace = null → globalna pula (szablony); workspace = X → kopie należące do workspace'u,
// zarządzane przez ws-admina (przez API). Bezpośredni CRUD w /admin: tylko system-admin.
export const AiSkills: CollectionConfig = {
  slug: 'ai-skills',
  labels: { singular: 'Skill AI', plural: 'Skille AI' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'workspace', 'category', 'enabled'], group: 'System' },
  access: {
    read: anyLoggedIn,
    create: isSystemAdmin,
    update: isSystemAdmin,
    delete: isSystemAdmin,
  },
  indexes: [{ fields: ['workspace'] }],
  fields: [
    { name: 'workspace', type: 'relationship', relationTo: 'workspaces', index: true, admin: { description: 'Puste = globalny szablon (pula).' } },
    { name: 'key', type: 'text', required: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'text' },
    { name: 'category', type: 'select', required: true, defaultValue: 'apply', options: [
      { label: 'Wciel komentarze', value: 'apply' },
      { label: 'Popraw / refine', value: 'refine' },
    ] },
    { name: 'instruction', type: 'textarea', required: true, admin: { description: 'Dodatkowa instrukcja dla modelu (tryb wcielania).' } },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'builtin', type: 'checkbox', defaultValue: false, admin: { description: 'Pochodzi z domyślnej puli.' } },
    { name: 'sortOrder', type: 'number', defaultValue: 0 },
  ],
}
