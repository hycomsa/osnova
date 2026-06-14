# Deployment

Osnova is a standard Next.js (App Router) application backed by PostgreSQL, with
Keycloak for auth and Git remotes for content. This page covers a production rollout.

## System requirements

| Tier | vCPU | RAM | Disk (SSD) | Notes |
|------|------|-----|-----------|-------|
| Minimum | 2 | 4 GB | 25 GB | App + Postgres on one box, **build elsewhere** (CI) |
| Recommended | 4 | 8 GB | 50 GB | Build on-box, dozens of users |
| Growth | 4–8 | 16 GB | 80–100 GB | Many/large repos, audit-log growth, local backups |

- **RAM:** the spike is `next build` (`--max-old-space-size=8000` → up to ~8 GB). Runtime
  (`next start`) is light; building in CI lets the app VM run on 4 GB.
- **Disk:** OS + `node_modules`/`.next` (~3 GB) · `WORKTREES_DIR` (a full git clone per bound
  repo — re-clonable cache) · PostgreSQL (collaboration data; the audit log grows). Prefer SSD.
- **Keycloak** is external. **Local Ollama** (if used for AI) needs its own host with large
  RAM/GPU — see [configuration.md](configuration.md#ai-optional).

## Runtime dependencies

- **Node.js ≥ 20.9** (`engines` in `package.json`; `.nvmrc` = 20).
- **`git` binary** on the host/image — the app shells out via `simple-git` to clone/fetch/push
  workspace repos. (Required at runtime, not just build.)
- **PostgreSQL 16** (managed or self-hosted).
- A reverse proxy (nginx/Caddy/Traefik) terminating **TLS** in front of the app on `:3000`.
- **Network egress:** Git remote (HTTPS 443 / SSH 22), Keycloak (HTTPS), and — if enabled —
  AI provider APIs (HTTPS) and SMTP. Keep PostgreSQL on a private network.

## Build

A `Dockerfile` is included for a production image:

```bash
docker build -t osnova .
docker run -p 3000:3000 --env-file .env.production osnova
```

Or build directly:

```bash
npm ci
npm run build
npm start            # serves on PORT (default 3000)
```

`npm run build` uses an enlarged heap (`--max-old-space-size=8000`).

## Required environment (production)

Set at minimum (see [configuration.md](configuration.md)):

- `DATABASE_URI` — production PostgreSQL.
- `PAYLOAD_SECRET`, `SESSION_SECRET` — strong, unique secrets (`openssl rand -hex 32`).
- `APP_URL` — the public HTTPS URL. The Keycloak client's redirect URI must be
  `${APP_URL}/api/auth/callback`.
- `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID` (+ `KEYCLOAK_CLIENT_SECRET` if confidential).
- `ADMIN_EMAILS`.
- `WORKTREES_DIR` — a **persistent, writable** path (per-workspace Git clones live
  here). Size it for your repositories.
- Credential env vars referenced by repo bindings (e.g. `GITLAB_TOKEN`).
- SMTP + `MAIL_FROM` + `CRON_SECRET` if you want email digests.
- Optional AI: `AI_PROVIDER` + provider keys (`ANTHROPIC_*` / `OPENAI_*` / `OLLAMA_*`) —
  see [configuration.md](configuration.md#ai-optional). Verify at `/ai-health` (system admin).

## Hardening

- **Secrets**: never commit `.env`. Rotate `PAYLOAD_SECRET`/`SESSION_SECRET` and Git
  tokens periodically; tokens are referenced by env-var name, so rotation is an env
  change, not a DB edit.
- **HTTPS**: terminate TLS in front of the app; cookies (`osnova_session`) are
  session-bound JWTs.
- **Database**: restrict network access; back up regularly
  (see [administration.md](administration.md#backup--restore)).
- **Worktrees volume**: mount `WORKTREES_DIR` on durable storage; it can be rebuilt by
  re-cloning, but holding it avoids cold-start clones.

## Scheduling the digest

The digest endpoint is triggered by an external scheduler (cron, Kubernetes CronJob,
GitHub Actions, a hosted cron service), authenticated with `CRON_SECRET`:

```bash
# daily, every morning
curl -fsS -X POST "https://osnova.example.com/api/notifications/digest?frequency=daily" \
  -H "x-cron-secret: $CRON_SECRET"
```

Run a weekly variant on its own schedule (`frequency=weekly`). Use `dryRun=1` to
preview without sending. If SMTP is unconfigured the call is a safe no-op.

### Acceptance-reports reconcile (optional)

If you use document acceptance reports, schedule a periodic reconcile so the DB mirror
catches up with out-of-band frontmatter edits (it's revision-aware — a no-op when nothing
changed). Suggested every ~2 h:

```bash
curl -fsS -X POST "https://osnova.example.com/api/reports/reconcile" \
  -H "x-cron-secret: $CRON_SECRET"
```

Reports also reconcile automatically when a workspace's repo revision changes during normal
use; this cron only covers repos nobody is browsing.

## Health & operations

- The app clones each workspace's repo on first access into `WORKTREES_DIR`; subsequent
  requests fetch and fall back to the cached copy if the remote is unreachable.
- Schema is managed by the PayloadCMS `db-postgres` adapter. Review migration strategy
  before upgrading in production.
- Monitor disk usage of `WORKTREES_DIR` and PostgreSQL.

Back to the [README](../README.md).
