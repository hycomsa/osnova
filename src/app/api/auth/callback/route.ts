import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import * as oidc from 'openid-client'
import { getPayload } from 'payload'
import { keycloakConfig } from '@/lib/auth/keycloak'
import { SESSION_COOKIE, createSessionToken } from '@/lib/session'

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const verifier = req.cookies.get('osnova_pkce')?.value
  const state = req.cookies.get('osnova_state')?.value
  if (!verifier || !state) return NextResponse.redirect(new URL('/?error=auth_flow', appUrl))

  const kc = await keycloakConfig()
  let claims: oidc.IDToken | undefined
  try {
    const tokens = await oidc.authorizationCodeGrant(kc, new URL(req.url), {
      pkceCodeVerifier: verifier,
      expectedState: state,
    })
    claims = tokens.claims()
  } catch {
    return NextResponse.redirect(new URL('/?error=token_exchange', appUrl))
  }
  const sub = claims?.sub
  const email = typeof claims?.email === 'string' ? claims.email : null
  const name = typeof claims?.name === 'string' ? claims.name : undefined
  if (!sub || !email) return NextResponse.redirect(new URL('/?error=missing_claims', appUrl))

  const payload = await getPayload({ config })
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const globalRoles: 'system_admin'[] = adminEmails.includes(email.toLowerCase()) ? ['system_admin'] : []

  const existing = await payload.find({
    collection: 'users',
    where: { keycloakSub: { equals: sub } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: { email, name, globalRoles },
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'users',
      data: { keycloakSub: sub, email, name, globalRoles },
      overrideAccess: true,
    })
  }

  const token = await createSessionToken({ sub, email, name })
  const res = NextResponse.redirect(new URL('/', appUrl))
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600 })
  res.cookies.set('osnova_pkce', '', { path: '/', maxAge: 0 })
  res.cookies.set('osnova_state', '', { path: '/', maxAge: 0 })
  // zapamiętany język użytkownika → cookie, aby UI od razu był w jego języku
  const savedLocale = (existing.docs[0] as any)?.locale as string | undefined
  if (savedLocale === 'pl' || savedLocale === 'en' || savedLocale === 'de') {
    res.cookies.set('osnova_locale', savedLocale, { sameSite: 'lax', path: '/', maxAge: 365 * 24 * 3600 })
  }
  return res
}
