import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ authenticated: false }, { status: 200 })
  return NextResponse.json({
    authenticated: true,
    id: user.id,
    sub: (user as any).sub ?? String(user.id),
    email: user.email,
    name: user.name ?? null,
    isSystemAdmin: (user.globalRoles ?? []).includes('system_admin'),
    locale: (user as any).locale ?? null,
    emailDigest: (user as any).emailDigest ?? 'daily',
  })
}

// PATCH { emailDigest: 'none'|'daily'|'weekly' } — samoobsługowa zmiana preferencji podsumowań e-mail.
export async function PATCH(req: NextRequest) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { body = {} }
  const allowed = ['none', 'daily', 'weekly']
  if (!allowed.includes(body.emailDigest)) return NextResponse.json({ error: 'Invalid emailDigest' }, { status: 400 })
  await payload.update({ collection: 'users', id: user.id, data: { emailDigest: body.emailDigest } as any, overrideAccess: true })
  return NextResponse.json({ ok: true, emailDigest: body.emailDigest })
}
