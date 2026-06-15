import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { enqueueRepoSync } from '@/lib/jobs'
import { cloneDefaultSkillsToWorkspace } from '@/lib/ai/skills-service'

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSystemAdmin = (user.globalRoles ?? []).includes('system_admin')

  // zbiór workspace'ów: admin widzi wszystkie, pozostali tylko swoje (przez członkostwa)
  let wsDocs: any[]
  if (isSystemAdmin) {
    wsDocs = (await payload.find({ collection: 'workspaces', limit: 200, overrideAccess: true })).docs
  } else {
    const ms = await payload.find({ collection: 'memberships', where: { user: { equals: user.id } }, depth: 1, limit: 200, overrideAccess: true })
    wsDocs = ms.docs.map((m: any) => m.workspace).filter((w: any) => w && typeof w === 'object')
  }

  const ids = wsDocs.map((w) => w.id)
  // liczba członków per workspace + role bieżącego użytkownika (jedno zapytanie)
  const allMs = ids.length
    ? (await payload.find({ collection: 'memberships', where: { workspace: { in: ids } }, limit: 2000, overrideAccess: true })).docs
    : []
  const memberCount = new Map<string, number>()
  const myRoles = new Map<string, string[]>()
  for (const m of allMs as any[]) {
    const wid = String(typeof m.workspace === 'object' ? m.workspace?.id : m.workspace)
    memberCount.set(wid, (memberCount.get(wid) ?? 0) + 1)
    const uid = String(typeof m.user === 'object' ? m.user?.id : m.user)
    if (uid === String(user.id)) myRoles.set(wid, Array.isArray(m.roles) ? m.roles : [])
  }

  const workspaces = wsDocs
    .map((w: any) => ({
      id: w.id, name: w.name, slug: w.slug, defaultView: w.defaultView ?? null,
      roles: myRoles.get(String(w.id)) ?? [],
      memberCount: memberCount.get(String(w.id)) ?? 0,
      updatedAt: w.updatedAt ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ workspaces, isSystemAdmin })
}

// Kreator workspace (system-admin): tworzy workspace + repo-binding + widoki + członków w jednym wywołaniu.
export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(user.globalRoles ?? []).includes('system_admin')) return NextResponse.json({ error: 'Tylko administrator systemu może tworzyć workspace.' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const name = String(body?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Brak nazwy workspace.' }, { status: 400 })

  try {
    const ws = await payload.create({ collection: 'workspaces', overrideAccess: true, data: { name, defaultView: body.defaultView || 'client_business' } as any })
    const wsId = ws.id

    let queuedSync = false
    if (body.repo?.repoUrl) {
      await payload.create({ collection: 'repo-bindings', overrideAccess: true, data: {
        workspace: wsId, host: body.repo.host === 'github' ? 'github' : 'gitlab',
        repoUrl: String(body.repo.repoUrl), branch: String(body.repo.branch || 'main'),
        credentialRef: body.repo.credentialRef || undefined,
      } as any })
      // pre-warm: klon repo w tle (zadanie kolejki), by pierwsze otwarcie nie czekało na klon
      await enqueueRepoSync(payload, wsId).catch(() => {})
      queuedSync = true
    }
    for (const v of Array.isArray(body.views) ? body.views : []) {
      if (v?.view !== 'client_business' && v?.view !== 'client_technical') continue
      await payload.create({ collection: 'view-configs', overrideAccess: true, data: {
        workspace: wsId, view: v.view, source: 'osnova',
        includeGlobs: (Array.isArray(v.includeGlobs) ? v.includeGlobs : []).map((glob: string) => ({ glob })),
        excludeGlobs: [], hideUnderscored: v.hideUnderscored !== false, showMetadata: Boolean(v.showMetadata),
      } as any })
    }
    for (const m of Array.isArray(body.members) ? body.members : []) {
      if (!m?.user || !Array.isArray(m.roles) || m.roles.length === 0) continue
      const uid = /^\d+$/.test(String(m.user)) ? Number(m.user) : m.user
      await payload.create({ collection: 'memberships', overrideAccess: true, data: { workspace: wsId, user: uid, roles: m.roles } as any })
    }
    // skopiuj domyślną pulę skilli AI na nowy workspace (ws-admin może je potem edytować)
    await cloneDefaultSkillsToWorkspace(payload, wsId).catch(() => {})
    return NextResponse.json({ ok: true, id: wsId, slug: (ws as any).slug, queuedSync })
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 400 })
  }
}
