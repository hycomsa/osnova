# Configuration reference

All runtime configuration is via environment variables (loaded from `.env` in
development) plus per-workspace settings stored in the database. This page is the
canonical reference.

## Environment variables

### Core (required)

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URI` | `postgres://osnova:osnova@localhost:5433/osnova` | PostgreSQL connection string (Payload `db-postgres`). |
| `PAYLOAD_SECRET` | _random_ | Payload encryption/signing key. |
| `SESSION_SECRET` | _random, ≥16 chars_ | HS256 signing key for the `osnova_session` JWT. |
| `APP_URL` | `http://localhost:3000` | Public base URL; used for the OIDC redirect URI and links in emails. |

### Keycloak / authentication

| Variable | Example | Purpose |
|----------|---------|---------|
| `KEYCLOAK_ISSUER` | `https://auth.example.com/realms/osnova` | OIDC issuer (realm endpoint). |
| `KEYCLOAK_CLIENT_ID` | `frontend` | OIDC client id. |
| `KEYCLOAK_CLIENT_SECRET` | _(empty)_ | Only for **confidential** clients; leave empty for public/PKCE. |
| `ADMIN_EMAILS` | `a@x.com,b@x.com` | Comma-separated; matching users get the `system_admin` global role on login. |

See [keycloak.md](keycloak.md) for realm setup.

### Git worktrees

| Variable | Example | Purpose |
|----------|---------|---------|
| `WORKTREES_DIR` | `./data/worktrees` | Where each workspace's repository is cloned (one subdir per workspace id). |
| `GITLAB_TOKEN` | `glpat-…` | A token **referenced by name** from a repo binding's `credentialRef`; injected as `oauth2:<token>@host` at fetch time. Any env var name can be used as a credential ref. |

`WORKTREES_DIR` (`data/`) is gitignored — it holds live clones and token-bearing
remote URLs. Never commit it.

### Email digest (optional)

If unset, digests are a no-op (logged, not sent). Configure either `SMTP_URL` **or**
the `SMTP_HOST` group.

| Variable | Example | Purpose |
|----------|---------|---------|
| `SMTP_URL` | `smtp://user:pass@host:587` | Full SMTP connection string. |
| `SMTP_HOST` | `smtp.example.com` | Host (alternative to `SMTP_URL`). |
| `SMTP_PORT` | `587` | Port (default 587). |
| `SMTP_USER` / `SMTP_PASS` | — | Credentials. |
| `SMTP_SECURE` | `true` | Use TLS. |
| `MAIL_FROM` | `Osnova <no-reply@osnova.local>` | Sender. |
| `CRON_SECRET` | _random_ | Shared secret; send as `x-cron-secret` header to trigger `POST /api/notifications/digest` from a scheduler. |

See [administration.md](administration.md) for scheduling the digest.

## Per-workspace configuration (database)

These live in PayloadCMS collections (`/admin`), not in env vars.

### Repo bindings (`repo-bindings`)
Bind a workspace to a Git repository:

- `host` — `gitlab` or `github`
- `repoUrl` — clone URL
- `branch` — target branch (commits are pushed here)
- `credentialRef` — the **name** of the env var holding the access token (e.g.
  `GITLAB_TOKEN`). The token value itself is never stored in the database.

### View configs (`view-configs`)
One row per (workspace, view). Views are `direct`, `client_business`,
`client_technical`.

- `includeGlobs` / `excludeGlobs` — picomatch globs (dot-aware) deciding which
  files are visible in this view.
- `hideUnderscored` — hide `**/_*/**` paths.
- `showMetadata` — render YAML frontmatter as a table (default off — metadata is
  hidden in all views unless enabled).
- `source` — `hybrid` (default), `docsconfig`, or `osnova`: where rules come from
  (an in-repo `.docs.config.yaml`, the database, or both).

Client views are **fail-closed**: with no matching include rule, nothing is visible.
The direct view (`direct`) is the most permissive. `.gitignore`-tracked files
and `.gitkeep` are always excluded; `.attachments/` are served but hidden from the
tree.

### In-repo `.docs.config.yaml` (optional)
A repository can ship its own view/section configuration, merged according to the
view config's `source`. This lets the documentation structure travel with the repo.

## AI (optional)

The AI-assisted comment incorporation feature uses Anthropic's Claude. It's entirely
optional — when unconfigured, the AI action simply isn't offered.

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key for Claude. Leave empty to disable AI features. |
| `ANTHROPIC_MODEL` | Model to use (default `claude-sonnet-4-6`). |

The key is read server-side only and never exposed to the browser. Access is additionally
gated per user by the `edit` and `ai-use` permissions, and skills are managed per workspace
(see [administration.md](administration.md#ai-skills)).

Next: [Keycloak setup »](keycloak.md)
