import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { activeProvider, healthCheck, healthCheckAll, listProviders, type ProviderId } from '@/lib/ai/providers'

async function requireAdmin(req: NextRequest) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(user.globalRoles ?? []).includes('system_admin')) return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

// Konfiguracja dostawców AI (bez sieci) — szybkie.
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req)
  if ('err' in r) return r.err
  return NextResponse.json({ active: activeProvider(), providers: listProviders() })
}

// Live healthcheck — body { provider? }: testuje jednego lub wszystkich skonfigurowanych.
export async function POST(req: NextRequest) {
  const r = await requireAdmin(req)
  if ('err' in r) return r.err
  let body: { provider?: string } = {}
  try { body = await req.json() } catch { /* puste = wszystkie */ }
  const ids = listProviders().map((p) => p.id) as ProviderId[]
  if (body.provider && ids.includes(body.provider as ProviderId)) {
    return NextResponse.json({ results: [await healthCheck(body.provider as ProviderId)] })
  }
  return NextResponse.json({ results: await healthCheckAll() })
}
