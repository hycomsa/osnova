# Getting started

This guide takes you from a fresh clone to a running Osnova instance on
`http://localhost:3000`.

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js ≥ 20.9** | Matches the `engines` field in `package.json`. |
| **npm** | The repo ships a `package-lock.json`; npm is the reference package manager. |
| **Docker** (or a local PostgreSQL 16) | Used for the database via `docker-compose.yml`. |
| **A Keycloak realm** | For login. See [keycloak.md](keycloak.md). A realm is required even for local use. |
| **Git** | Workspaces are backed by Git repositories. |

## 1. Clone and install

```bash
git clone git@github.com:hycomsa/osnova.git
cd osnova
npm install
```

## 2. Start PostgreSQL

The bundled Compose file runs PostgreSQL 16 on host port **5433**:

```bash
docker compose up -d
```

This creates a container named `osnova-postgres` (user/password/db all `osnova`)
with a persistent volume `osnova_pgdata`. If you prefer your own PostgreSQL, point
`DATABASE_URI` at it instead (see [configuration.md](configuration.md)).

## 3. Configure the environment

```bash
cp .env.example .env
```

Then edit `.env`. The defaults work for local PostgreSQL; you must set the
**Keycloak** values and strong secrets:

```ini
DATABASE_URI=postgres://osnova:osnova@localhost:5433/osnova
PAYLOAD_SECRET=<random string>
SESSION_SECRET=<random string, min 16 chars>
APP_URL=http://localhost:3000
KEYCLOAK_ISSUER=https://<your-keycloak>/realms/osnova
KEYCLOAK_CLIENT_ID=frontend
KEYCLOAK_CLIENT_SECRET=          # only for confidential clients
ADMIN_EMAILS=you@example.com     # these users become system admins on first login
WORKTREES_DIR=./data/worktrees
GITLAB_TOKEN=                     # token for private repos, referenced by repo bindings
```

Generate secrets with e.g. `openssl rand -hex 32`. The full reference for every
variable is in [configuration.md](configuration.md). `.env` is gitignored — never
commit it.

## 4. Seed demo data (optional)

```bash
npm run seed
```

This creates a demo workspace (`ai-sdlc-test`), an admin user, a client user, a
membership, and two view configurations, so you have something to look at
immediately. The seed is idempotent (find-or-create).

## 5. Run

```bash
npm run dev
```

Open `http://localhost:3000`. You'll be sent to Keycloak to log in; on return,
any email listed in `ADMIN_EMAILS` is granted the `system_admin` role.

- **App UI:** `http://localhost:3000`
- **Payload admin:** `http://localhost:3000/admin`

## 6. Verify

```bash
npm test            # vitest — unit/integration suite
npx tsc --noEmit    # typecheck (there is no standalone build-less type script)
```

## Troubleshooting

- **Login loops / `redirect_uri` errors** → the Keycloak client's redirect URI must
  exactly equal `${APP_URL}/api/auth/callback`. See [keycloak.md](keycloak.md).
- **`ECONNREFUSED` to Postgres** → the container isn't up or the port differs; check
  `docker ps` for `osnova-postgres` on `5433`.
- **A workspace shows nothing** → its Git repo hasn't been cloned/bound, or the active
  view filters everything out. See [administration.md](administration.md).
- **Corrupted `.next`** → stop the dev server and run `npm run devsafe` (clears `.next`).

Next: [Configuration reference »](configuration.md)
