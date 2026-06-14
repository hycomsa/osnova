import { getPayload } from 'payload'
import config from '../payload.config'

// Jednorazowa aktualizacja istniejących danych: dodaj '**/changelog.md' do excludeGlobs
// we wszystkich konfiguracjach widoków klienckich (client_business, client_technical),
// jeśli jeszcze go nie ma. Idempotentne. Uruchom tak jak seed:
//   node --env-file=.env --import tsx src/scripts/exclude-changelog.ts
const GLOB = '**/changelog.md'
const CLIENT_VIEWS = ['client_business', 'client_technical']

async function run() {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'view-configs',
    where: { view: { in: CLIENT_VIEWS } },
    limit: 1000, depth: 0, overrideAccess: true,
  })
  let updated = 0
  for (const cfg of res.docs as any[]) {
    const globs = (cfg.excludeGlobs ?? []) as { glob: string }[]
    if (globs.some((g) => g.glob === GLOB)) continue
    await payload.update({
      collection: 'view-configs', id: cfg.id, overrideAccess: true,
      data: { excludeGlobs: [...globs.map((g) => ({ glob: g.glob })), { glob: GLOB }] } as any,
    })
    updated++
    console.log(`  + ${GLOB} → view-config ${cfg.id} (ws ${typeof cfg.workspace === 'object' ? cfg.workspace.id : cfg.workspace}, ${cfg.view})`)
  }
  console.log(`Done. Updated ${updated} of ${res.docs.length} client view-config(s).`)
  process.exit(0)
}
run().catch((e) => { console.error(e); process.exit(1) })
