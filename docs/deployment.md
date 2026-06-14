# Deployment

Osnova is a standard Next.js (App Router) application backed by PostgreSQL, with
Keycloak for auth and Git remotes for content. This page covers a production rollout.

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

## Health & operations

- The app clones each workspace's repo on first access into `WORKTREES_DIR`; subsequent
  requests fetch and fall back to the cached copy if the remote is unreachable.
- Schema is managed by the PayloadCMS `db-postgres` adapter. Review migration strategy
  before upgrading in production.
- Monitor disk usage of `WORKTREES_DIR` and PostgreSQL.

Back to the [README](../README.md).
