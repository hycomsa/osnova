import { getPayload } from 'payload'
import config from './payload.config'
import { cloneDefaultSkillsToWorkspace, seedGlobalSkills } from './lib/ai/skills-service'

// domyślnie realny sub użytkownika test-client@hycom.pl z Keycloak (realm osnova) — by browser-login działał
const CLIENT_SUB = process.env.TEST_CLIENT_SUB || '7620cf79-f032-4e00-971e-afd7ff290e4c'
const ADMIN_SUB = process.env.TEST_ADMIN_SUB || 'e2e-admin'
const ADMIN_EMAIL = (process.env.ADMIN_EMAILS || 'admin@osnova.local').split(',')[0].trim()

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
const EXCLUDE = ['.ai/context/_input/**']

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

  const admin = await foc(payload, 'users', { keycloakSub: { equals: ADMIN_SUB } }, {
    keycloakSub: ADMIN_SUB,
    email: ADMIN_EMAIL,
    name: 'Seed Admin',
    globalRoles: ['system_admin'],
  })

  const client = await foc(payload, 'users', { keycloakSub: { equals: CLIENT_SUB } }, {
    keycloakSub: CLIENT_SUB,
    email: 'test-client@hycom.pl',
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

  console.log(`SEED_OK ws=${ws.id} admin=${admin.id}(${ADMIN_SUB}) client=${client.id}(${CLIENT_SUB})`)
  process.exit(0)
}

run().catch((e) => {
  console.error('SEED_FAIL', e)
  process.exit(1)
})
