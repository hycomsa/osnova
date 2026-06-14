import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { getDocument, getRawDocument, getWorkspaceContext, writeDocument } from '@/lib/read-service'
import { ALL_VIEWS, type ViewName } from '@/lib/roles'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  const path = req.nextUrl.searchParams.get('path') ?? ''
  const format = req.nextUrl.searchParams.get('format') ?? ''
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    if (format === 'raw') {
      const { content } = await getRawDocument(ctx, path)
      return NextResponse.json({ kind: 'raw', path, content, canEdit: ctx.isSystemAdmin || ctx.roles.some((r) => r === 'editor' || r === 'workspace_maintainer') })
    }
    const doc = await getDocument(ctx, path)
    if (doc.kind === 'markdown') return NextResponse.json({ kind: 'markdown', path, html: doc.html })
    // właściwa nazwa pliku przy pobieraniu (URL kończy się na /file, więc bez tego przeglądarka nazwałaby plik „file")
    const name = path.split('/').pop() || 'file'
    const asciiName = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
    const disposition = `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`
    return new NextResponse(new Uint8Array(doc.data), {
      status: 200,
      headers: { 'Content-Type': doc.contentType, 'Content-Disposition': disposition, 'Cache-Control': 'private, max-age=60' },
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })

  let body: { path?: string; content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const path = body.path ?? ''
  const content = body.content
  if (!path || typeof content !== 'string') return NextResponse.json({ error: 'Missing path or content' }, { status: 400 })

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    const author = { name: user.name || user.email, email: user.email }
    const { commit } = await writeDocument(ctx, path, content, author)
    return NextResponse.json({ ok: true, commit })
  } catch (e) {
    return toErrorResponse(e)
  }
}
