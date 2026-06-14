import type { CollectionConfig } from 'payload'
import { isSystemAdmin } from '../access'

export const RepoBindings: CollectionConfig = {
  slug: 'repo-bindings',
  labels: { singular: 'Repozytorium', plural: 'Repozytoria' },
  admin: { useAsTitle: 'repoUrl', defaultColumns: ['workspace', 'host', 'repoUrl', 'branch'], group: 'Konfiguracja' },
  access: {
    read: isSystemAdmin,
    create: isSystemAdmin,
    update: isSystemAdmin,
    delete: isSystemAdmin,
  },
  fields: [
    { name: 'workspace', type: 'relationship', relationTo: 'workspaces', label: 'Workspace', required: true, index: true },
    { name: 'host', type: 'select', label: 'Host', required: true, options: [{ label: 'GitLab', value: 'gitlab' }, { label: 'GitHub', value: 'github' }] },
    { name: 'repoUrl', type: 'text', label: 'Adres repozytorium (URL)', required: true },
    { name: 'branch', type: 'text', label: 'Gałąź', required: true, defaultValue: 'main' },
    {
      name: 'credentialRef',
      type: 'text',
      label: 'Token (zmienna środowiskowa)',
      admin: {
        description:
          'Nazwa zmiennej środowiskowej z tokenem (np. GITLAB_TOKEN). Token NIE jest przechowywany w bazie.',
      },
    },
  ],
}
