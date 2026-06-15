import { getPayload } from 'payload'
import config from './payload.config'
import { cloneDefaultSkillsToWorkspace, seedGlobalSkills } from './lib/ai/skills-service'

const ADMIN_EMAIL = (process.env.ADMIN_EMAILS || 'admin@osnova.local').split(',')[0].trim()
const CLIENT_EMAIL = process.env.TEST_CLIENT_EMAIL || 'test-client@hycom.pl'
// `subject` = stały klucz tożsamości. W trybie proxy to e-mail; w trybie OIDC to claim „sub"
// (ustaw wtedy TEST_ADMIN_SUBJECT/TEST_CLIENT_SUBJECT na realne sub-y, by browser-login mapował się na seed).
const ADMIN_SUBJECT = process.env.TEST_ADMIN_SUBJECT || process.env.TEST_ADMIN_SUB || ADMIN_EMAIL
const CLIENT_SUBJECT = process.env.TEST_CLIENT_SUBJECT || process.env.TEST_CLIENT_SUB || CLIENT_EMAIL

const BIZ_INCLUDE = [
  '.ai/context/README.md',
  '.ai/context/state.md',
  '.ai/context/project-config.md',
  '.ai/context/intent-specs/**',
  '.ai/context/requirements/**',
  '.ai/context/func-specs/**',
]
const TECH_INCLUDE = [
  ...BIZ_INCLUDE,
  '.ai/context/adrs/**',
  '.ai/context/specs/**',
  '.ai/context/references/**',
  '.ai/context/environments/**',
  '.ai/context/mockups/**',
]
// Domyślnie ukrywane w widokach klienckich (m.in. changelogi — szum techniczny dla klienta)
const EXCLUDE = ['.ai/context/_input/**', '**/changelog.md']

async function foc(payload: any, collection: string, where: any, data: any): Promise<any> {
  const found = await payload.find({ collection, where, limit: 1, overrideAccess: true })
  if (found.docs[0]) return found.docs[0]
  return payload.create({ collection, data, overrideAccess: true })
}

async function run() {
  const payload = await getPayload({ config })

  const ws = await foc(payload, 'workspaces', { slug: { equals: 'ai-sdlc-test' } }, {
    name: 'AI SDLC (test)',
    slug: 'ai-sdlc-test',
    defaultView: 'client_business',
  })

  await foc(payload, 'repo-bindings', { workspace: { equals: ws.id } }, {
    workspace: ws.id,
    host: 'gitlab',
    repoUrl: 'https://gitlab.hycom.pl/csl/ai-sdlc-test.git',
    branch: 'main',
    credentialRef: 'GITLAB_TOKEN',
  })

  await foc(payload, 'view-configs', { and: [{ workspace: { equals: ws.id } }, { view: { equals: 'client_business' } }] }, {
    workspace: ws.id,
    view: 'client_business',
    source: 'osnova',
    includeGlobs: BIZ_INCLUDE.map((glob) => ({ glob })),
    excludeGlobs: EXCLUDE.map((glob) => ({ glob })),
  })
  await foc(payload, 'view-configs', { and: [{ workspace: { equals: ws.id } }, { view: { equals: 'client_technical' } }] }, {
    workspace: ws.id,
    view: 'client_technical',
    source: 'osnova',
    includeGlobs: TECH_INCLUDE.map((glob) => ({ glob })),
    excludeGlobs: EXCLUDE.map((glob) => ({ glob })),
  })

  const admin = await foc(payload, 'users', { keycloakSub: { equals: ADMIN_SUBJECT } }, {
    keycloakSub: ADMIN_SUBJECT,
    email: ADMIN_EMAIL,
    name: 'Seed Admin',
    globalRoles: ['system_admin'],
  })

  const client = await foc(payload, 'users', { keycloakSub: { equals: CLIENT_SUBJECT } }, {
    keycloakSub: CLIENT_SUBJECT,
    email: CLIENT_EMAIL,
    name: 'Test Client',
    globalRoles: [],
  })

  await foc(payload, 'memberships', { and: [{ workspace: { equals: ws.id } }, { user: { equals: client.id } }] }, {
    workspace: ws.id,
    user: client.id,
    roles: ['client_business'],
  })

  // skille AI: globalna pula + kopie na seedowy workspace
  await seedGlobalSkills(payload)
  await cloneDefaultSkillsToWorkspace(payload, ws.id)

  console.log(`SEED_OK ws=${ws.id} admin=${admin.id}(${ADMIN_SUBJECT}) client=${client.id}(${CLIENT_SUBJECT})`)
  process.exit(0)
}

run().catch((e) => {
  console.error('SEED_FAIL', e)
  process.exit(1)
})
