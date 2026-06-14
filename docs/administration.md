# Administration guide

For system admins and workspace maintainers. Most tasks are available both in the
in-app wizard/UI and the PayloadCMS admin panel (`/admin`).

## Roles & permissions

| Role | Scope | Can |
|------|-------|-----|
| `system_admin` | Global | Everything; create workspaces, bind repos, manage all data. |
| `workspace_maintainer` | Workspace | Manage members, roles, view config; edit; approve. |
| `editor` | Workspace | Read, comment, edit (WYSIWYG + raw), manage files. |
| `client_technical` | Workspace | Read (incl. technical view), comment, approve. |
| `client_business` | Workspace | Read (business view), comment, approve. |
| `viewer` | Workspace | Read only, within the permitted view. |

A user becomes `system_admin` automatically on first login if their email is in
`ADMIN_EMAILS`. All checks are enforced server-side.

## Creating a workspace

### In-app wizard (recommended)
As a system admin, use the **New workspace** wizard:

1. **Basics** — name (auto-slugified) and default view.
2. **Repository** — host (GitLab/GitHub), repo URL, branch, and `credentialRef` (the
   name of the env var holding the access token, e.g. `GITLAB_TOKEN`).
3. **Views** — enable client views; set include globs, `hideUnderscored`,
   `showMetadata` per view.
4. **Team** — assign roles to members.

It performs one orchestrated `POST /api/workspaces` creating the workspace, repo
binding, view configs, and memberships.

### Admin panel
Alternatively create the rows directly under `/admin`: `Workspaces`, `RepoBindings`,
`ViewConfigs`, `Memberships`.

## Configuring views

Per (workspace, view) in `ViewConfigs`:

- `includeGlobs` / `excludeGlobs` — what's visible (dot-aware picomatch).
- `hideUnderscored` — hide `**/_*/**`.
- `showMetadata` — show YAML frontmatter as a table (default off).
- `source` — `hybrid` / `docsconfig` / `osnova`.

Client views are fail-closed: include something or nothing shows. The direct view is
most permissive. See [configuration.md](configuration.md#per-workspace-configuration-database).

## Managing members

Add `Memberships` rows (user + workspace + roles). Roles can be combined where
sensible. Removing a membership revokes all access to that workspace.

## Repositories & tokens

A workspace's `RepoBinding` stores the repo URL, branch, and a `credentialRef`. The
actual token is read at runtime from the environment variable of that name — so rotate
tokens by updating the env var, not the database. Working copies live under
`WORKTREES_DIR` (gitignored).

## Notifications & the email digest

Users opt into a **daily** or **weekly** digest (or off) from the notifications inbox.
To deliver digests:

1. Configure SMTP (see [configuration.md](configuration.md#email-digest-optional)).
2. Schedule a call to the digest endpoint, authenticated with `CRON_SECRET`:

```bash
curl -X POST "$APP_URL/api/notifications/digest" -H "x-cron-secret: $CRON_SECRET"
```

Query params: `dryRun=1` (compute, don't send) and `frequency=daily,weekly` (default
both). A system admin session can also trigger it. See
[deployment.md](deployment.md#scheduling-the-digest).

## AI skills

If AI is configured (see [configuration.md](configuration.md#ai-optional)), workspace
maintainers manage the **skills** offered to reviewers at `/ws/<id>/ai-skills`. A skill is a
reusable instruction Claude follows when folding accepted comments into a document (e.g.
*apply verbatim*, *unify tone*, *condense*, *refine language*, *restructure*).

- New workspaces can **import the default skill set** from a shared pool, then edit it.
- Each skill has a name, description, category (*apply* or *refine*), the instruction text,
  and an enabled flag.
- Skills are per-workspace, so each team can encode its own house style.

Reviewers run a skill from a document's **AI** action — which requires both the `edit` and
`ai-use` permissions — and always review the proposed diff before it is committed.

## Backup & restore

State to back up:

- **PostgreSQL** — the collaboration layer and config: `pg_dump` / `pg_restore`.
- **Git repositories** — the documents themselves live in the bound remotes (already
  durable). `WORKTREES_DIR` is a disposable cache and need not be backed up.

```bash
pg_dump "$DATABASE_URI" > osnova-$(date +%F).sql
```

Next: [Development »](development.md)
