import { proxyConfig } from './mode'
import type { Identity } from './provision'

// Derive a display name from an email local-part when the proxy doesn't supply one.
// e.g. "jan.kowalski@x.pl" -> "Jan Kowalski"
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ') || email
  )
}

// Resolve the authenticated identity from trusted reverse-proxy headers.
// Returns null when the request is not (or not provably) authenticated by the proxy.
//
// SECURITY: this trusts the identity header unconditionally. It is only safe when the app is
// unreachable except through the proxy (bind to 127.0.0.1), and the proxy strips any
// client-supplied copy of the header before setting its own. Optionally set
// PROXY_AUTH_SHARED_SECRET so the app also requires a secret header the proxy injects.
export function resolveProxyIdentity(headers: Headers): Identity | null {
  const cfg = proxyConfig()

  // Defense-in-depth: reject requests that don't carry the shared secret (when configured).
  if (cfg.secret && headers.get(cfg.secretHeader) !== cfg.secret) return null

  let email = headers.get(cfg.header)?.trim() || null

  // Local-dev fallback (never in production): act as a fixed user without a real proxy.
  if (!email && process.env.NODE_ENV !== 'production' && cfg.devUser) email = cfg.devUser

  if (!email || !email.includes('@')) return null
  email = email.toLowerCase()

  // Name precedence: explicit full-name header → given + family composed → derived from email.
  const composed = [headers.get(cfg.givenNameHeader), headers.get(cfg.familyNameHeader)]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
  const name = headers.get(cfg.nameHeader)?.trim() || composed || nameFromEmail(email)
  return { subject: email, email, name }
}
