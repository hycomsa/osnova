<div align="center">

<img src="../osnova-splash4.png" alt="Osnova" width="820" />

# Osnova — Product Showcase

**The documentation your suppliers write *is* the documentation your clients read.**
Same files. Same Git history. One controlled, beautiful window onto it.

</div>

---

## The problem, in one sentence

Specs live in Git; clients live in email, slide decks, and stale PDF exports — so the
two drift apart the moment a project starts moving.

## The Osnova answer

A permission-aware web layer **on top of your repository**. Suppliers keep working in
Git; clients get a clean reader, scoped editing, and real collaboration — and every
change is a commit you can `git log`, `git diff`, and `git blame`.

<div align="center"><img src="../screenshots/04-viewer.png" alt="Document viewer" width="920" /></div>

---

## 1. Controlled access, by design

Up to three **views** per workspace — Direct, Client–Business, Client–Technical — each a
glob-filtered slice of the same repo. Client views are **fail-closed**: nothing shows
unless explicitly allowed. Roles gate every action, server-side.

<div align="center">
<img src="../screenshots/26-workspace-switcher.png" alt="Workspaces" width="440" />
<img src="../screenshots/43-access-card-icon.png" alt="Access control" width="440" />
</div>

---

## 2. A reading experience clients actually like

A first-class page tree (favorites, recents, `⌘K` palette), seven preview styles, deep
links to any heading, Mermaid diagrams, inline PDFs, and collapsible blocks.

<div align="center">
<img src="../screenshots/64-page-tree-light.png" alt="Page tree" width="300" />
<img src="../screenshots/07-command-palette.png" alt="Command palette" width="540" />
</div>

<div align="center">
<img src="../screenshots/34-style-editorial.png" width="210" />
<img src="../screenshots/34-style-reading.png" width="210" />
<img src="../screenshots/34-style-technical.png" width="210" />
<img src="../screenshots/34-style-terminal.png" width="210" />
</div>

---

<div align="center">

<img src="../osnova-splash2.png" alt="Osnova — collaboration" width="820" />

## 3. Collaboration in context

</div>

Inline and document-level comments, `@mentions`, reactions, and a review workflow
(approve / reject with an optional thread comment / optional in-review) with stale-revision
detection — and **live presence** so you can see who's in the document with you.

<div align="center">
<img src="../screenshots/10-comments.png" alt="Comments" width="440" />
<img src="../screenshots/51-approval.png" alt="Approval" width="440" />
</div>

A tidy, **Office-style ribbon** keeps the actions organized — and collapses to icons when
you want the screen back.

<div align="center"><img src="../screenshots/79-ribbon-expanded.png" alt="Ribbon toolbar" width="920" /></div>

---

## 4. AI that folds feedback into the doc — with you in control

Mark comments **accepted**, pick a curated **skill** (apply verbatim, unify tone, condense,
refine, restructure), and Claude proposes the rewrite. You review the diff and edit before
it ever becomes a commit. Workspace admins manage the skill set per workspace.

<div align="center"><img src="../screenshots/83-ai-skills.png" alt="AI skills" width="880" /></div>

---

<div align="center">

<img src="../osnova-splash1.png" alt="Osnova — git-native" width="820" />

## 5. Git-native, all the way down

</div>

History, diff, blame, and one-click **restore** come straight from Git. Concurrent edits
get auto-rebased, and true conflicts open a **guided resolution wizard** instead of a
cryptic error.

<div align="center"><img src="../screenshots/50-diff-view.png" alt="Diff view" width="920" /></div>

And because relationships matter, every document can render a **dependency graph** of its
cross-references — colour-coded by area, shaped by doc-type.

<div align="center"><img src="../screenshots/82-dependency-graph.png" alt="Dependency graph" width="920" /></div>

---

<div align="center">

<img src="../osnova-splash3.png" alt="Osnova" width="820" />

## Ready in minutes

</div>

```bash
git clone git@github.com:hycomsa/osnova.git && cd osnova
docker compose up -d        # PostgreSQL 16
cp .env.example .env        # Keycloak + secrets
npm install && npm run seed && npm run dev
```

Speaks **Polish, English, and German** out of the box — login screen included.

<div align="center">
<img src="../screenshots/57-i18n-viewer-pl.png" width="290" />
<img src="../screenshots/55-i18n-splash-en.png" width="290" />
<img src="../screenshots/56-i18n-viewer-de.png" width="290" />
</div>

---

<div align="center">

**[← Back to README](../README.md)** · **[Full feature guide →](features.md)** · **[Get started →](getting-started.md)**

Released under the [MIT License](../LICENSE). Copyright © 2026 Hycom.

</div>
