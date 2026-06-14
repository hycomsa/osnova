# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report them privately to **security@hycom.pl** (or via GitHub's
[private vulnerability reporting](https://github.com/hycomsa/osnova/security/advisories/new)).

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a proof of concept if possible).
- Affected version / commit and your environment.

We aim to acknowledge reports within **3 business days** and to provide a remediation
timeline after triage. We'll keep you informed of progress and credit you in the
release notes unless you prefer to remain anonymous.

## Supported versions

Osnova is pre-1.0 and under active development. Security fixes target the `main`
branch and the latest release.

| Version | Supported |
|---------|-----------|
| `main` / latest release | ✅ |
| older tags | ❌ |

## Scope & design notes

Access control in Osnova is **server-enforced and fail-closed**. Client roles never
receive the `direct` view, and client views show nothing unless explicitly included.
The relevant enforcement lives in `src/lib/read-service.ts`, `view-rules.ts`,
`content-access.ts`, and `roles.ts`.

When in doubt about whether something is a vulnerability, report it privately — we'd
rather take a look than miss it.

## Handling secrets

Never commit secrets. `.env`, access tokens (GitLab/GitHub), Keycloak client secrets,
`ANTHROPIC_API_KEY`, and anything under `data/` are gitignored and must stay out of the
repository and out of issue reports. If you believe a secret has been committed, treat
it as compromised: rotate it and notify the maintainers.
