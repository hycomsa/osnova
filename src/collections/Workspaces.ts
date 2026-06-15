import type { CollectionConfig } from 'payload'
import { anyLoggedIn, isSystemAdmin } from '../access'
import { slugify } from '../lib/slug'

export const Workspaces: CollectionConfig = {
  slug: 'workspaces',
  labels: { singular: 'Workspace', plural: 'Workspace’y' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'slug', 'defaultView'], group: 'Workspace’y' },
  access: {
    read: anyLoggedIn,
    create: isSystemAdmin,
    update: isSystemAdmin,
    delete: isSystemAdmin,
  },
  hooks: {
    beforeValidate: [
      async ({ data, req, originalDoc, operation }) => {
        if (!data) return data
        // auto-kod ze nazwy, gdy slug pusty
        if (!data.slug && data.name) {
          const base = slugify(String(data.name))
          let candidate = base || 'workspace'
          let n = 1
          // zapewnij unikalność
          while (true) {
            const existing = await req.payload.find({
              collection: 'workspaces',
              where: { slug: { equals: candidate } },
              limit: 1,
              overrideAccess: true,
            })
            const clash = existing.docs.find((d: any) => d.id !== (originalDoc as any)?.id)
            if (!clash) break
            n += 1
            candidate = `${base}-${n}`
          }
          data.slug = candidate
        } else if (data.slug) {
          data.slug = slugify(String(data.slug))
        }
        void operation
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: { description: 'Kod workspace (URL). Pozostaw puste — wygeneruje się z nazwy.' },
    },
    {
      name: 'defaultView',
      type: 'select',
      label: 'Domyślny widok',
      required: true,
      defaultValue: 'client_business',
      options: [
        { label: 'Bezpośredni (pełny 1:1)', value: 'direct' },
        { label: 'Kliencki — biznesowy', value: 'client_business' },
        { label: 'Kliencki — techniczny', value: 'client_technical' },
      ],
    },
    // Odwrotne relacje (join) — listy powiązanych rekordów na stronie szczegółów workspace
    // w /admin. Wirtualne (zapytanie po polu `workspace` w powiązanej kolekcji), bez zmian w DB.
    {
      name: 'viewConfigs',
      type: 'join',
      collection: 'view-configs',
      on: 'workspace',
      label: 'Konfiguracje widoków',
      admin: { defaultColumns: ['view', 'source', 'hideUnderscored', 'showMetadata'] },
    },
    {
      name: 'repoBindings',
      type: 'join',
      collection: 'repo-bindings',
      on: 'workspace',
      label: 'Powiązania repo',
    },
  ],
}
