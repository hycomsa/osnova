import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Workspaces } from './collections/Workspaces'
import { Memberships } from './collections/Memberships'
import { RepoBindings } from './collections/RepoBindings'
import { ViewConfigs } from './collections/ViewConfigs'
import { Comments } from './collections/Comments'
import { Approvals } from './collections/Approvals'
import { Notifications } from './collections/Notifications'
import { Favorites } from './collections/Favorites'
import { AuditLog } from './collections/AuditLog'
import { cloneRepoTask } from './jobs/clone-repo'
import { AiSkills } from './collections/AiSkills'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' — Osnova Administracja',
      description: 'Panel administracyjny Osnova: workspace’y, członkowie, role, repozytoria, widoki.',
    },
    components: {
      graphics: {
        Logo: '/components/admin/Logo.tsx#default',
        Icon: '/components/admin/Icon.tsx#default',
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Workspaces, Memberships, RepoBindings, ViewConfigs, Comments, Approvals, Notifications, Favorites, AuditLog, AiSkills],
  // Kolejka zadań w tle (klon/odświeżanie repo). Zadania wyzwalamy ręcznie przez
  // payload.jobs.run() po zakolejkowaniu (jeden proces Next). W produkcji można
  // zamiast tego użyć crona/bina `payload jobs:run` albo autoRun.
  jobs: {
    deleteJobOnComplete: false, // zachowaj ukończone zadania, by dało się odpytać o status
    tasks: [cloneRepoTask],
    jobsCollectionOverrides: ({ defaultJobsCollection }) => {
      defaultJobsCollection.admin = { ...(defaultJobsCollection.admin ?? {}), group: 'System', hidden: false }
      return defaultJobsCollection
    },
  },
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
  }),
  sharp,
  plugins: [],
})
