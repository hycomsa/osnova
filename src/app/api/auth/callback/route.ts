import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import * as oidc from 'openid-client'
import { getPayload } from 'payload'
import { keycloakConfig } from '@/lib/auth/keycloak'
import { upsertUser } from '@/lib/auth/provision'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  // Każdy błąd kończymy łagodnym przekierowaniem na stronę logowania z kodem etapu (nigdy 500),
  // a pełny błąd (ze stackiem) trafia do logów serwera — `?error=<etap>` wskazuje gdzie pękło.
  const fail = (stage: string, err?: unknown) => {
    console.error(`[auth] callback failed at ${stage}:`, err instanceof Error ? (err.stack ?? err.message) : (err ?? ''))
    return NextResponse.redirect(new URL(`/?error=${stage}`, appUrl))
  }

  const verifier = req.cookies.get('osnova_pkce')?.value
  const state = req.cookies.get('osnova_state')?.value
  if (!verifier || !state) return fail('auth_flow')

  let claims: oidc.IDToken | undefined
  try {
    const kc = await keycloakConfig()
    // Za reverse-proxy `req.url` ma wewnętrzny origin (np. http://127.0.0.1:3000), przez co
    // openid-client wyliczyłby błędne redirect_uri. Budujemy URL walidacji z publicznego APP_URL
    // (tego samego, którego użył krok /login), zachowując oryginalny query.
    const currentUrl = new URL('/api/auth/callback', appUrl)
    currentUrl.search = new URL(req.url).search
    const tokens = await oidc.authorizationCodeGrant(kc, currentUrl, {
      pkceCodeVerifier: verifier,
      expectedState: state,
    })
    claims = tokens.claims()
  } catch (e) {
    return fail('token_exchange', e)
  }

  const sub = claims?.sub
  const email = typeof claims?.email === 'string' ? claims.email : null
  const name = typeof claims?.name === 'string' ? claims.name : undefined
  if (!sub || !email) return fail('missing_claims')

  let user
  try {
    const payload = await getPayload({ config })
    user = await upsertUser(payload, { subject: sub, email, name })
  } catch (e) {
    return fail('provision', e)
  }

  try {
    const token = await createSessionToken({ sub, email, name })
    const res = NextResponse.redirect(new URL('/', appUrl))
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600 })
    res.cookies.set('osnova_pkce', '', { path: '/', maxAge: 0 })
    res.cookies.set('osnova_state', '', { path: '/', maxAge: 0 })
    // zapamiętany język użytkownika → cookie, aby UI od razu był w jego języku
    const savedLocale = (user as any)?.locale as string | undefined
    if (savedLocale === 'pl' || savedLocale === 'en' || savedLocale === 'de') {
      res.cookies.set('osnova_locale', savedLocale, { sameSite: 'lax', path: '/', maxAge: 365 * 24 * 3600 })
    }
    return res
  } catch (e) {
    return fail('session', e)
  }
}
