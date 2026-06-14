import type { CollectionConfig } from 'payload'
import { isSystemAdmin } from '../access'

export const ViewConfigs: CollectionConfig = {
  slug: 'view-configs',
  labels: { singular: 'Konfiguracja widoku', plural: 'Konfiguracje widoków' },
  admin: { useAsTitle: 'view', defaultColumns: ['workspace', 'view', 'source', 'hideUnderscored', 'showMetadata'], group: 'Konfiguracja' },
  access: {
    read: isSystemAdmin,
    create: isSystemAdmin,
    update: isSystemAdmin,
    delete: isSystemAdmin,
  },
  fields: [
    { name: 'workspace', type: 'relationship', relationTo: 'workspaces', required: true, index: true },
    {
      name: 'view',
      type: 'select',
      required: true,
      options: [
        { label: 'Bezpośredni (pełny 1:1)', value: 'direct' },
        { label: 'Kliencki — biznesowy', value: 'client_business' },
        { label: 'Kliencki — techniczny', value: 'client_technical' },
      ],
      admin: { description: 'Bezpośredni bez reguł = pełny dostęp (najbardziej permisywny). Widoki klienckie bez reguł = nic (fail-closed).' },
    },
    { name: 'includeGlobs', type: 'array', fields: [{ name: 'glob', type: 'text', required: true }] },
    { name: 'excludeGlobs', type: 'array', fields: [{ name: 'glob', type: 'text', required: true }] },
    {
      name: 'hideUnderscored',
      type: 'checkbox',
      defaultValue: true,
      label: 'Ukryj katalogi zaczynające się od „_"',
      admin: {
        description:
          'Gdy włączone, ten widok nie pokazuje katalogów zaczynających się od „_" (np. _input) ani plików, które mają taki katalog w ścieżce.',
      },
    },
    {
      name: 'showMetadata',
      type: 'checkbox',
      defaultValue: false,
      label: 'Pokazuj metadane strony (frontmatter)',
      admin: {
        description:
          'Gdy wyłączone (domyślnie dla wszystkich widoków), nagłówek metadanych dokumentu (author, content_hash, sha256, last_synced…) nie jest renderowany. Gdy włączone — metadane są pokazywane jako tabela.',
      },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'hybrid',
      options: ['hybrid', 'docsconfig', 'osnova'],
    },
  ],
}
