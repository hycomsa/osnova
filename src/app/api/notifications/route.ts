import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'

// GET /api/notifications — lista powiadomień odbiorcy.
// Query: unread=1 (tylko nieprzeczytane), type=mention|reply|approval (grupuje warianty approval),
// limit (domyślnie 30, max 100), page (1+). Zawsze zwraca globalny licznik nieprzeczytanych.
export async function GET(req: NextRequest) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ notifications: [], unread: 0, total: 0, page: 1, totalPages: 1 }, { status: 200 })

  const url = new URL(req.url)
  const onlyUnread = url.searchParams.get('unread') === '1'
  const typeParam = url.searchParams.get('type')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 30), 1), 100)
  const page = Math.max(Number(url.searchParams.get('page') || 1), 1)

  const filters: any[] = [{ recipient: { equals: user.id } }]
  if (onlyUnread) filters.push({ read: { equals: false } })
  if (typeParam === 'approval') filters.push({ type: { in: ['approval', 'approval_approved', 'approval_changes'] } })
  else if (typeParam === 'mention') filters.push({ type: { equals: 'mention' } })
  else if (typeParam === 'reply') filters.push({ type: { equals: 'reply' } })

  const res = await payload.find({
    collection: 'notifications',
    where: filters.length > 1 ? { and: filters } : filters[0],
    sort: '-createdAt',
    depth: 1,
    limit,
    page,
    overrideAccess: true,
  })
  const notifications = (res.docs as any[]).map((n) => ({
    id: n.id,
    type: n.type,
    path: n.path,
    view: n.view,
    actorName: n.actorName,
    actorEmail: n.actorEmail,
    excerpt: n.excerpt,
    read: Boolean(n.read),
    createdAt: n.createdAt,
    workspaceSlug: n.workspace && typeof n.workspace === 'object' ? n.workspace.slug : undefined,
    workspaceName: n.workspace && typeof n.workspace === 'object' ? n.workspace.name : undefined,
  }))
  // globalny licznik nieprzeczytanych (niezależny od strony/filtra)
  const unreadRes = await payload.count({
    collection: 'notifications',
    where: { and: [{ recipient: { equals: user.id } }, { read: { equals: false } }] },
    overrideAccess: true,
  })
  return NextResponse.json({
    notifications,
    unread: unreadRes.totalDocs,
    total: res.totalDocs,
    page: res.page ?? page,
    totalPages: res.totalPages ?? 1,
  })
}

// PATCH { id } -> oznacz jedno jako przeczytane; { all: true } -> wszystkie
export async function PATCH(req: NextRequest) {
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { body = {} }

  if (body.all) {
    const res = await payload.find({
      collection: 'notifications',
      where: { and: [{ recipient: { equals: user.id } }, { read: { equals: false } }] },
      limit: 200, overrideAccess: true,
    })
    await Promise.all((res.docs as any[]).map((n) =>
      payload.update({ collection: 'notifications', id: n.id, data: { read: true }, overrideAccess: true }),
    ))
    return NextResponse.json({ ok: true, updated: res.docs.length })
  }

  if (body.id) {
    const n = await payload.findByID({ collection: 'notifications', id: body.id, overrideAccess: true }).catch(() => null)
    if (!n || String((n as any).recipient?.id ?? (n as any).recipient) !== String(user.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await payload.update({ collection: 'notifications', id: body.id, data: { read: true }, overrideAccess: true })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Missing id/all' }, { status: 400 })
}
