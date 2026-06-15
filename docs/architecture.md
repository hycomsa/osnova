# Architecture

## Overview

Osnova is a single Next.js application (App Router, React 19) embedding PayloadCMS for
its data layer and admin panel. Documents are **not** stored in the database — they
live in Git repositories, which Osnova clones into per-workspace working copies and
reads/writes through `simple-git`. The database holds only the collaboration layer
(workspaces, memberships, comments, approvals, notifications, favorites) and access
configuration.

```
                ┌─────────────────────────── Next.js app ───────────────────────────┐
   Browser ───► │  (frontend) React UI        API routes (/api/*)      PayloadCMS    │
                │   viewer · editor · tree     read-service · auth      /admin        │
                └───────┬───────────────────────────┬───────────────────────┬────────┘
                        │                            │                       │
                  SSO identity             Git worktrees             PostgreSQL 16
              proxy header / OIDC        data/worktrees/<id>      workspaces, members,
                                          (clone of repo)          comments, approvals,
                                                                   notifications, …
```

## Components

- **Frontend** (`src/app/(frontend)`): the viewer (`ws/[id]/[[...path]]`), editor
  (`components/DocEditor`), page tree (`components/DocsTree`), comments panel, approval
  control, history dialog, command palette.
- **API routes** (`src/app/api`): authentication (`auth/*`), per-workspace document
  and collaboration endpoints (`ws/[id]/*` — file, tree, history, diff, blame, search,
  comments, approval, attachments, favorites), notifications, locale, me.
- **Read service** (`src/lib/read-service.ts`): the heart of access control — builds a
  `WorkspaceContext` (resolved workspace, roles, view rules, worktree dir) and enforces
  what every request may see or write.
- **Git layer** (`src/lib/git/*`): clone/fetch/commit/push, file history, blame, diff
  parsing, binary commits for attachments.
- **Markdown pipeline** (`src/lib/markdown/render.ts`): remark/rehype — GFM, callouts,
  Mermaid tagging, image/attachment URL rewriting, PDF embeds, heading slugs,
  frontmatter extraction.
- **i18n** (`src/i18n/*`): react-i18next, cookie-based locale, server + client
  resolution, locale-aware dates.

## Data model (PayloadCMS collections)

`src/collections/`:

| Collection | Holds |
|------------|-------|
| `Users` | SSO-federated users, keyed on a stable subject (email in proxy mode, OIDC `sub` in oidc mode); locale and email-digest preference; global roles. |
| `Workspaces` | Project containers (name, slug, default view). |
| `Memberships` | User ↔ workspace role assignments. |
| `RepoBindings` | Git repo per workspace (host, URL, branch, `credentialRef`). |
| `ViewConfigs` | Per-(workspace, view) glob rules, `hideUnderscored`, `showMetadata`, source. |
| `Comments` | Inline/document comments: anchor (quote + context hash), thread, status, reactions. |
| `Approvals` | Per-document review state — status (`approved`/`rejected`/`in_review`), revision SHA, note, author. Mirror of the frontmatter stamp (source of truth). |
| `Notifications` | Recipient, type (mention/reply/approval_*), workspace, path, read flag. |
| `Favorites` | Per-user starred documents (unique per user+workspace+path). |

## Access-control model

Access is **server-enforced and fail-closed**. For any request:

1. The session JWT (`osnova_session`) resolves the user; membership resolves their
   roles in the target workspace (or `system_admin` globally).
2. The requested **view** must be allowed for those roles.
3. The view's rules (`ViewConfigs` and/or in-repo `.docs.config.yaml`) resolve to
   include/exclude globs; the path is checked with dot-aware picomatch.
4. `.gitignore`-tracked files and `.gitkeep` are always excluded; `.attachments/` are
   readable (so embeds resolve) but hidden from the tree.

Roles and the permission matrix live in `src/lib/roles.ts`; rule resolution in
`src/lib/view-rules.ts` and `src/lib/content-access.ts`.

## Git-native writes

Editing a document (or uploading an attachment) writes to the workspace's working copy
and **commits + pushes** as the logged-in user to the configured branch. Pushes that
race a remote change are auto `pull --rebase`-retried; unresolvable conflicts surface a
friendly error (a guided merge UI is on the [roadmap](features.md#roadmap)). Tokens for
private remotes are resolved at runtime from the env var named by the binding's
`credentialRef` and never stored in the database.

Next: [Administration »](administration.md)
