import { NextRequest, NextResponse } from 'next/server'
import * as oidc from 'openid-client'
import { SESSION_COOKIE } from '@/lib/session'
import { keycloakConfig } from '@/lib/auth/keycloak'
import { authMode, proxyConfig } from '@/lib/auth/mode'

// Wylogowanie inicjowane przez aplikację (RP-initiated logout):
// kończy sesję SSO w Keycloak, a nie tylko lokalną sesję Osnova.
export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  // Tryb proxy: prawdziwe wylogowanie należy do bramy/IdP. Wyjątek — gdy włączony fallback OIDC
  // i użytkownik ma cookie sesji (zalogował się przez Keycloak), kończymy też sesję w IdP.
  if (authMode() === 'proxy') {
    const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value)
    if (!(proxyConfig().oidcFallback && hasSession)) {
      const target = proxyConfig().logoutUrl ?? new URL('/', appUrl).toString()
      const res = NextResponse.redirect(target)
      res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
      return res
    }
    // else: fall through to the OIDC end-session flow below
  }
  let target = new URL('/', appUrl).toString()
  try {
    const config = await keycloakConfig()
    // dołącza client_id; post_logout_redirect_uri musi być zarejestrowany w kliencie Keycloak
    target = oidc.buildEndSessionUrl(config, { post_logout_redirect_uri: `${appUrl}/` }).toString()
  } catch {
    // Keycloak niedostępny / brak end_session — degraduj do wylogowania lokalnego
  }
  const res = NextResponse.redirect(target)
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
