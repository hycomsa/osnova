// Pluggable authentication mode.
//
// Osnova can run in one of two auth modes, selected by AUTH_MODE:
//   - 'proxy' (default): the app trusts a reverse proxy that has already authenticated the
//     user (e.g. via corporate SSO) and forwards the identity in a request header. The app
//     verifies no passwords/tokens itself — if the request carries the trusted header, the
//     user is considered authenticated. See src/lib/auth/proxy.ts and docs/proxy-auth.md.
//   - 'oidc': the app performs an OpenID Connect login itself (PKCE) against an OIDC provider
//     (e.g. Keycloak). See src/lib/auth/keycloak.ts and the /api/auth routes.
//
// The mechanism is vendor-neutral: header names and the optional shared secret are configurable.

export type AuthMode = 'proxy' | 'oidc'

export function authMode(): AuthMode {
  return (process.env.AUTH_MODE ?? '').trim().toLowerCase() === 'oidc' ? 'oidc' : 'proxy'
}

export interface ProxyAuthConfig {
  // Header carrying the authenticated user's email (their principal name / UPN).
  header: string
  // When true, requests without the trusted header fall back to OIDC login (Keycloak),
  // instead of the "no session" notice. Useful during migration or for users who reach the
  // app without going through the proxy. Requires the OIDC (KEYCLOAK_*) settings.
  oidcFallback: boolean
  // Optional header carrying the user's display name.
  nameHeader: string
  // Optional shared-secret defense: when `secret` is set, requests must also carry
  // `secretHeader` with the matching value, or they are rejected. Protects against a client
  // reaching the app directly (bypassing the proxy) and spoofing the identity header.
  secretHeader: string
  secret: string | null
  // Local-dev convenience: when no header is present and NODE_ENV !== 'production', treat this
  // email as the logged-in user (so `npm run dev` works without a proxy). Ignored in production.
  devUser: string | null
  // Where /api/auth/logout sends the browser in proxy mode (the proxy/IdP sign-out URL).
  logoutUrl: string | null
}

const trimmed = (v: string | undefined): string | null => {
  const s = (v ?? '').trim()
  return s ? s : null
}

// Parse a boolean env var with an explicit default when unset/empty.
const boolDefault = (v: string | undefined, def: boolean): boolean => {
  const s = (v ?? '').trim().toLowerCase()
  if (!s) return def
  return ['1', 'true', 'yes', 'on'].includes(s)
}

// OIDC fallback in proxy mode defaults to ON (set PROXY_AUTH_OIDC_FALLBACK=false to disable).
export function oidcFallbackEnabled(): boolean {
  return boolDefault(process.env.PROXY_AUTH_OIDC_FALLBACK, true)
}

// An OIDC provider is configured (issuer present) — required for the app-driven login flow.
export function oidcConfigured(): boolean {
  return Boolean((process.env.KEYCLOAK_ISSUER ?? '').trim())
}

// Whether the app-driven OIDC login flow should be offered: oidc mode, or proxy mode with the
// fallback enabled AND an OIDC provider actually configured (so we never show a broken button).
export function oidcLoginAvailable(): boolean {
  if (authMode() === 'oidc') return true
  return authMode() === 'proxy' && oidcFallbackEnabled() && oidcConfigured()
}

export function proxyConfig(): ProxyAuthConfig {
  return {
    header: trimmed(process.env.PROXY_AUTH_HEADER) ?? 'X-User-UPN',
    oidcFallback: oidcFallbackEnabled(),
    nameHeader: trimmed(process.env.PROXY_AUTH_NAME_HEADER) ?? 'X-User-Name',
    secretHeader: trimmed(process.env.PROXY_AUTH_SECRET_HEADER) ?? 'X-Proxy-Secret',
    secret: trimmed(process.env.PROXY_AUTH_SHARED_SECRET),
    devUser: trimmed(process.env.PROXY_AUTH_DEV_USER),
    logoutUrl: trimmed(process.env.PROXY_LOGOUT_URL),
  }
}
