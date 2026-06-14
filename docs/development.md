# Development

## Project layout

```
osnova/                      ← repository root (this directory)
├── src/
│   ├── app/
│   │   ├── (frontend)/       React UI: viewer, editor, tree, comments, styles
│   │   └── api/              route handlers: auth, ws/[id]/*, notifications, …
│   ├── collections/          PayloadCMS collections (data model)
│   ├── lib/                  read-service, git, markdown, comments, approvals,
│   │                         roles, view-rules, notifications, mail, tree, editor
│   ├── i18n/                 locales (pl/en/de), client/server helpers, dates
│   ├── components/           shared app chrome (header, user menu, bell)
│   ├── payload.config.ts     Payload config (collections, db adapter)
│   └── seed.ts               demo data seeder
├── tests/                    vitest suite (+ fixtures)
├── docs/                     this documentation
├── screenshots/              doc images
├── docker-compose.yml        PostgreSQL 16
├── Dockerfile                production image
└── .env.example              environment template
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (`http://localhost:3000`). |
| `npm run devsafe` | Clears `.next` then runs dev (use after a corrupted cache). |
| `npm run build` / `npm start` | Production build / serve. |
| `npm run seed` | Seed demo workspace + users (idempotent). |
| `npm test` / `npm run test:watch` | Vitest run / watch. |
| `npm run generate:types` | Regenerate `src/payload-types.ts` after collection changes. |
| `npm run generate:importmap` | Regenerate Payload import map. |

There is no standalone typecheck script; run `npx tsc --noEmit` (TypeScript is also
checked during `npm run build`).

## Testing

Vitest runs in a Node environment over `tests/**/*.test.ts`, with `@` aliased to
`src`. Tests cover the git layer, markdown rendering, access control/view rules,
roles, comments/anchoring, approvals, search, the page-tree helpers, digest rendering,
and file operations (using a fixture repo helper). Add tests alongside the suite when
changing `lib/` logic.

```bash
npm test                       # full suite
npx vitest run tests/foo.test.ts   # a single file
```

## Conventions

- **Match surrounding code** — comment density, naming, and idioms are consistent
  within `lib/` (domain logic) and `(frontend)` (UI). Keep files focused.
- **After changing a collection**, run `npm run generate:types` so
  `payload-types.ts` stays in sync (the `db-postgres` adapter pushes schema in dev).
- **Access control lives in `lib/`** (`read-service`, `view-rules`, `content-access`,
  `roles`) and is server-enforced and fail-closed — never gate purely in the UI.
- **Documents are Git**, not database rows — writes go through the git layer and
  commit+push. Don't add a parallel content store.

## Local verification loop

```bash
npx tsc --noEmit && npm test
```

For UI changes, drive the running app (Playwright is available as a dev dependency).

Next: [Deployment »](deployment.md)
