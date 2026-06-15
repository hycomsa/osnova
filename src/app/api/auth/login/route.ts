import { NextRequest, NextResponse } from 'next/server'
import * as oidc from 'openid-client'
import { keycloakConfig, redirectUri } from '@/lib/auth/keycloak'
import { authMode } from '@/lib/auth/mode'
import { LOCALE_COOKIE, normalizeLocale } from '@/i18n/config'

export async function GET(req: NextRequest) {
  // Proxy mode: there is no app-driven login — the reverse proxy authenticates the user.
  if (authMode() === 'proxy') {
    return NextResponse.redirect(new URL('/', process.env.APP_URL ?? req.url))
  }
  const config = await keycloakConfig()
  const verifier = oidc.randomPKCECodeVerifier()
  const challenge = await oidc.calculatePKCECodeChallenge(verifier)
  const state = oidc.randomState()
  // spójność języka: przekaż wybrany język na ekrany logowania Keycloak (ui_locales)
  const locale = normalizeLocale(req.cookies.get(LOCALE_COOKIE)?.value)

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ui_locales: locale,
  })

  const res = NextResponse.redirect(url.href)
  const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 600 }
  res.cookies.set('osnova_pkce', verifier, cookieOpts)
  res.cookies.set('osnova_state', state, cookieOpts)
  return res
}
