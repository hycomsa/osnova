import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { LOCALE_COOKIE, normalizeLocale } from '@/i18n/config'

// Ustawia język w cookie i (jeśli zalogowany) zapamiętuje go na użytkowniku.
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { body = {} }
  const locale = normalizeLocale(body?.locale)

  const res = NextResponse.json({ ok: true, locale })
  res.cookies.set(LOCALE_COOKIE, locale, { sameSite: 'lax', path: '/', maxAge: 365 * 24 * 3600 })

  try {
    const payload = await getPayload({ config })
    const user = await getRequestUser(req, payload)
    if (user) await payload.update({ collection: 'users', id: user.id, data: { locale } as any, overrideAccess: true })
  } catch { /* zapis na userze nie blokuje zmiany języka */ }

  return res
}
