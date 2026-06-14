import type { CollectionConfig } from 'payload'
import { anyLoggedIn, isSystemAdmin } from '../access'

// Akceptacje dokumentów (sign-off): klient zatwierdza lub prosi o zmiany dla danej rewizji.
// Tworzone serwerowo (overrideAccess) przez warstwę usług.
export const Approvals: CollectionConfig = {
  slug: 'approvals',
  labels: { singular: 'Akceptacja', plural: 'Akceptacje' },
  admin: {
    useAsTitle: 'path',
    defaultColumns: ['path', 'status', 'authorEmail', 'revision', 'workspace'],
    group: 'Treść',
  },
  access: {
    read: anyLoggedIn,
    create: isSystemAdmin,
    update: isSystemAdmin,
    delete: isSystemAdmin,
  },
  fields: [
    { name: 'workspace', type: 'relationship', relationTo: 'workspaces', label: 'Workspace', required: true, index: true },
    { name: 'path', type: 'text', required: true, index: true },
    { name: 'revision', type: 'text', label: 'Rewizja (SHA)' },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: [
        { label: 'Zatwierdzony', value: 'approved' },
        { label: 'Poproszono o zmiany', value: 'changes_requested' },
      ],
    },
    { name: 'note', type: 'textarea', label: 'Uwaga' },
    { name: 'authorSub', type: 'text', required: true, index: true },
    { name: 'authorName', type: 'text' },
    { name: 'authorEmail', type: 'text' },
  ],
}
