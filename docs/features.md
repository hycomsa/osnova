# Feature guide

A complete tour of what Osnova does today. Screenshots are illustrative; your
content and theme will differ.

> Everything below is **implemented**. For things explicitly *not* yet built, see
> [Roadmap](#roadmap) at the end.

## Authentication & onboarding

Login is delegated to Keycloak (OIDC + PKCE). The login screen follows the chosen
language. After login you land on the workspace picker.

![Login](../screenshots/01-login.png)
![Workspaces](../screenshots/02-home-workspaces.png)

## Views & role-based access

Each workspace can expose up to three **views**, each a filtered presentation of the
same Git repository:

- **Direct (1:1)** — the repository as-is; most permissive.
- **Client — Business** — a simplified, filtered slice for business stakeholders.
- **Client — Technical** — the business slice plus ADRs and architecture/infra docs.

Visibility is glob-based and configured per workspace and view. Client views are
**fail-closed** (nothing shows unless explicitly included), `.gitignore`/`.gitkeep`
are respected, and document metadata/frontmatter is hidden by default. Roles
(`workspace_maintainer`, `editor`, `client_technical`, `client_business`, `viewer`,
plus the global `system_admin`) gate every action server-side.

![Access](../screenshots/43-access-card-icon.png)
![Workspace switcher](../screenshots/26-workspace-switcher.png)

## Reading documents

A clean, friendly Markdown reader with GitHub-Flavored Markdown, callouts
(`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), **Mermaid**
diagrams, inline images, downloadable attachments, and copyable heading anchors.

![Viewer](../screenshots/04-viewer.png)
![Document open](../screenshots/23-viewer-doc-open.png)

### Inline PDF embeds
Reference a PDF with image syntax — `![label](file.pdf)` — and it renders inline in an
embedded viewer with a download affordance. A plain link `[label](file.pdf)` stays a
download link.

![PDF embed](../screenshots/63-pdf-embed.png)

### Deep links & anchors
Every document has a shareable URL (`/ws/<slug>/<path>?view=<view>`), and every heading
has a copyable anchor — link straight to a clause.

![Deep link](../screenshots/25-deeplink-dark.png)
![Heading anchor](../screenshots/33-heading-anchor-copy.png)

## The page tree

A first-class navigation tree: **favorites** (starred per user), **recently opened**,
expand/collapse-all, live filtering, and a `⌘K`/`Ctrl-K` command palette. Plus
full-text search and frontmatter-derived tag filtering.

![Page tree](../screenshots/64-page-tree-light.png)
![Command palette](../screenshots/07-command-palette.png)
![Search](../screenshots/06-search.png)

## Editing

A dual-mode editor: **WYSIWYG** (TipTap) with a formatting toolbar, bubble menu, and
task lists — or **raw Markdown**. The WYSIWYG surface renders in the *current preview
style*, so editing looks like reading. Images and attachments can be dragged, pasted,
or picked; they're stored in an `.attachments/` folder beside the document and
committed to Git. Every save is a commit and push.

![WYSIWYG editor](../screenshots/11-editor-wysiwyg.png)
![Editor toolbar](../screenshots/47-editor-toolbar.png)
![Attachments](../screenshots/49-editor-attachments.png)

## Comments, mentions, reactions

Comment inline (anchored to a text selection) or at the document level. Threads
support replies, `@mentions` (which notify), emoji reactions, and resolve/reopen.
Inline comments leave visible marks in the text and survive edits via fuzzy
re-anchoring.

![Comments](../screenshots/10-comments.png)
![Selection comment](../screenshots/45-selection-comment.png)
![Mentions](../screenshots/31-mention-autocomplete.png)
![Reactions](../screenshots/28-comments-reactions.png)

### Live presence
Lightweight presence shows who else is on the same document **right now** — avatars in the
toolbar, with the activity (viewing / editing / commenting). It's heartbeat-based (no
WebSocket dependency) and ephemeral, so it stays accurate without extra infrastructure.

### Accepting comments
Reviewers with edit rights can mark a comment **accepted** — a signal that it should be
acted on. Accepted comments are exactly what the AI incorporation flow (below) folds into
the document, keeping the human in control of *what* gets applied.

## AI-assisted comment incorporation

Turn a thread of accepted review comments into clean prose. Claude reads the document and
the accepted, open, top-level comments, then proposes an updated version — and you review a
**current-vs-proposed diff** and can hand-edit the result before it's committed and pushed.
Nothing changes without your sign-off.

Instead of writing prompts, reviewers pick a **skill**: a curated, reusable instruction such
as *apply verbatim*, *unify tone*, *condense*, *refine language*, or *restructure*. Workspace
admins manage the skill set per workspace (seeded from a shared default pool, then editable),
so each team gets house-style behaviour. The action is gated by both `edit` and `ai-use`
permissions, and requires `ANTHROPIC_API_KEY` to be configured.

![AI skills](../screenshots/83-ai-skills.png)

## Document dependency graph

Every document can show how it relates to the rest of the repository: a directed graph of
cross-references, laid out in columns by link depth, **colour-coded by folder/area** and
shaped by doc-type, with a 1–3 degree selector, pan/zoom, hover highlighting, and
click-to-open. The graph is indexed on disk and re-indexed when the repository revision
changes, so it opens fast even on large repos. Client views never surface internal
`.ai/context` config files in the graph.

![Dependency graph](../screenshots/82-dependency-graph.png)

## Guided conflict resolution

Concurrent edits are handled gracefully. Osnova first tries an automatic `pull --rebase`;
when that succeeds the save just goes through. On a genuine conflict, a **guided wizard**
presents the conflicting hunks side by side and lets you choose — yours, theirs, or a manual
merge — then commits the resolved file. No raw conflict markers, no lost work.

![Conflict wizard](../screenshots/52-wizard-step1.png)
![Resolution](../screenshots/53-wizard-result.png)

## Document properties

Edit a document's frontmatter (title/name, doc-type, tags, and other metadata) through a
structured **Properties** panel instead of hand-editing YAML — changes are written back to
the file and committed.

## Approvals

A lightweight sign-off workflow: **approve** or **request changes** (with a note). The
status pill detects when a document has changed since approval and flags it as stale.
Only roles with the `approve` permission can act.

![Approval](../screenshots/51-approval.png)

## History, diff, blame & restore — from Git

Browse every revision of a file, preview it at any commit, view a unified diff with
line numbers and add/delete counts, or open per-line blame. You can also **restore** any
past revision — including a file that was deleted — which is written back as a new commit,
so nothing is ever truly lost and the history stays linear.

![Diff view](../screenshots/50-diff-view.png)
![Blame](../screenshots/09-blame.png)

## Content preview styles

Seven reading styles — **Editorial** (default), Standard, Reading, Technical,
Terminal, Neon, Pastel — independent of the app's light/dark theme. They differ in
font, colour, bullet glyphs, spacing, **column width**, **paragraph alignment**, and
**heading alignment**.

![Style picker](../screenshots/44-style-picker-preview.png)
![Editorial](../screenshots/34-style-editorial.png)
![Reading](../screenshots/34-style-reading.png)
![Technical](../screenshots/34-style-technical.png)

## Notifications

A bell with an unread badge, a full inbox (filter by type, unread-only, pagination),
and an opt-in **email digest** (daily or weekly) of unread activity, rendered in the
recipient's language. An **audit log** records significant actions (edits, role changes,
approvals, deletions) for accountability.

![Notifications bell](../screenshots/41-notifications-bell.png)
![Inbox](../screenshots/62-notifications-inbox.png)

## Multi-language (PL / EN / DE)

The entire UI is translated and remembered per user; the Keycloak login follows suit
via `ui_locales`; dates are locale-aware.

![Polish](../screenshots/57-i18n-viewer-pl.png)
![English](../screenshots/55-i18n-splash-en.png)
![German](../screenshots/56-i18n-viewer-de.png)

## Workspace wizard & admin

System admins can create a workspace through a guided in-app wizard (basics → repo →
views → team), or manage everything directly in the PayloadCMS admin panel.

![Wizard](../screenshots/52-wizard-step1.png)
![Admin](../screenshots/40-admin-dashboard.png)

## Roadmap

Not yet implemented — deliberately listed here so the docs don't overclaim:

- **PlantUML** diagrams (Mermaid is supported today) and **YouTube** embeds.
- **Document templates / blueprints.**
- **Real-time co-editing** (CRDT/OT). Live *presence* ships today; simultaneous
  character-level co-authoring does not.
- **Public read-only share links** for non-Keycloak recipients.

Recently shipped (previously on this list): guided merge-conflict resolution, live
presence, AI-assisted comment incorporation, the document dependency graph, document
properties editing, and one-click restore from history.

See [Administration »](administration.md) for managing these features.
