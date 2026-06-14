# Contributing to Osnova

Thanks for your interest in improving Osnova! This guide covers how to set up, make
changes, and submit them.

## Getting set up

Follow [docs/getting-started.md](docs/getting-started.md) to run Osnova locally
(Node ≥ 20.9, PostgreSQL via Docker, a Keycloak realm, `.env`).

## Development workflow

1. **Branch** off `main`:
   - `feature/<short-name>` for features
   - `fix/<short-name>` for bug fixes
   - `docs/<short-name>` for documentation
2. **Make focused changes.** Match the style of the surrounding code; keep files
   focused (domain logic in `src/lib`, UI in `src/app/(frontend)`). See
   [docs/development.md](docs/development.md).
3. **Add or update tests** for any change to `src/lib` logic. Tests live in `tests/`
   and run under Vitest.
4. **Verify before pushing:**
   ```bash
   npx tsc --noEmit
   npm test
   ```
   For UI changes, run the app and check the affected screens.
5. **Regenerate types** if you changed a PayloadCMS collection:
   ```bash
   npm run generate:types
   ```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(tree): add favorites to the page tree
fix(editor): preserve attachment paths on save
docs(keycloak): clarify confidential-client setup
```

Keep commits coherent and scoped. Reference issues where relevant.

## Pull requests

- Describe **what** changed and **why**; link related issues.
- Note any user-facing or configuration changes (new env vars, migrations).
- Ensure typecheck and tests pass; include screenshots for UI changes.
- Don't commit secrets — `.env`, tokens, or anything under `data/` (gitignored).

## Security

Access control is server-enforced and fail-closed (`src/lib/read-service.ts`,
`view-rules.ts`, `content-access.ts`, `roles.ts`). When touching these paths, add
tests that prove unauthorized access is denied. Please report security issues
privately to the maintainers rather than opening a public issue.

## License

By contributing, you agree that your contributions are licensed under the project's
[MIT License](LICENSE).
