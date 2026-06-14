import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { getWorkspaceContext } from '@/lib/read-service'
import { getReportsIndex } from '@/lib/reports'

// POST /api/reports/reconcile — backstop uzgadniający bazę akceptacji ze stemplami we
// frontmatterze (źródło prawdy). Pociąga repo każdego workspace'u i — gdy zmieniła się
// rewizja — przebudowuje indeks raportów (co uruchamia reconcileApprovals). Lekki: gdy
// rewizja bez zmian, indeks jest z cache i nic się nie przelicza.
//
// Autoryzacja: x-cron-secret === CRON_SECRET (scheduler, np. co 2 h) lub zalogowany system_admin.
export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })

  const secret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  let authorized = Boolean(secret && headerSecret && headerSecret === secret)
  if (!authorized) {
    const user = await getRequestUser(req, payload)
    authorized = Boolean(user && ((user as any).globalRoles as string[] | undefined)?.includes('system_admin'))
  }
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // syntetyczny system-admin: omija członkostwo, ma wszystkie uprawnienia i dostęp do widoku direct
  const sysUser = { id: 0, globalRoles: ['system_admin'], email: 'system@osnova' }
  const bindings = await payload.find({ collection: 'repo-bindings', limit: 1000, depth: 0, overrideAccess: true })
  const seen = new Set<string>()
  const results: Array<{ workspace: string; docs?: number; rev?: string; error?: string }> = []

  for (const b of bindings.docs as any[]) {
    const wsId = String(typeof b.workspace === 'object' && b.workspace ? b.workspace.id : b.workspace)
    if (!wsId || seen.has(wsId)) continue
    seen.add(wsId)
    try {
      // widok direct widzi wszystkie pliki → jedno uzgodnienie pokrywa wszystkie akceptacje
      const ctx = await getWorkspaceContext({ payload, user: sysUser, workspaceId: wsId, view: 'direct', forceFetch: true })
      const idx = await getReportsIndex(payload, ctx)
      results.push({ workspace: wsId, docs: idx.docs.length, rev: idx.rev })
    } catch (e) {
      results.push({ workspace: wsId, error: String((e as Error).message).split('\n')[0] })
    }
  }

  return NextResponse.json({ ok: true, workspaces: results.length, results })
}
