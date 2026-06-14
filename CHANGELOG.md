# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Office-style **ribbon toolbar** for the document viewer, collapsible to a compact
  icon strip (preference persists per user).
- **Live presence** — avatars showing who else is viewing/editing/commenting on the
  same document right now.
- **AI-assisted comment incorporation**: fold *accepted* review comments into a
  document with Claude, reviewing the diff before it's committed. Gated by `edit` +
  `ai-use` permissions.
- Predefined, workspace-managed **AI skills** (apply verbatim, unify tone, condense,
  refine language, restructure), seeded from a shared default pool.
- **Document dependency graph** — a readable directed graph of cross-references,
  colour-coded by folder/area and shaped by doc-type, indexed and persisted on disk.
- **Guided merge-conflict wizard** for concurrent edits (auto-rebase first, then a
  hunk-by-hunk resolution UI).
- View & edit **document properties / frontmatter** through a structured panel.
- **Restore** a file to any prior revision (including a deleted file) as a new commit.
- **Collapsible callout blocks** in Markdown rendering.
- Inline **PDF embeds** via image syntax (`![](file.pdf)`).
- **Security & action audit log.**
- Async repository clone/refresh via the Payload **jobs queue**.
- **Workspace dashboard** home with a searchable card grid.
- **Mobile / responsive** layout for the document viewer.
- Open-source project scaffolding: CI (GitHub Actions), `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, issue/PR templates, Dependabot, `.editorconfig`, `.nvmrc`.

### Changed
- Wider tree/command-palette search; client views hide internal infra files.
- Tables render at full width with horizontal scroll.
- Documentation refresh: new Showcase gallery and updated feature/admin/config guides.

### Accessibility
- Keyboard focus rings, accessible names, and improved muted-text contrast.

### Security
- Internal PRD untracked and gitignored.

[Unreleased]: https://github.com/hycomsa/osnova/commits/main
