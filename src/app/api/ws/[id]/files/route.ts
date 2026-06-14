import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import {
  createDocument, deleteDocument, duplicateDocument, getWorkspaceContext, renameDocument, restoreDocument,
} from '@/lib/read-service'
import { ALL_VIEWS, type ViewName } from '@/lib/roles'

type Op = 'create' | 'delete' | 'rename' | 'duplicate' | 'restore'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })

  let body: { op?: Op; path?: string; toPath?: string; content?: string; rev?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { op, path, toPath, content } = body
  if (!op || !path) return NextResponse.json({ error: 'Missing op or path' }, { status: 400 })

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    const author = { name: user.name || user.email, email: user.email }
    let result: { commit: string }
    switch (op) {
      case 'create':
        result = await createDocument(ctx, path, content ?? '', author)
        break
      case 'delete':
        result = await deleteDocument(ctx, path, author)
        break
      case 'rename':
        if (!toPath) return NextResponse.json({ error: 'Missing toPath' }, { status: 400 })
        result = await renameDocument(ctx, path, toPath, author)
        break
      case 'duplicate':
        if (!toPath) return NextResponse.json({ error: 'Missing toPath' }, { status: 400 })
        result = await duplicateDocument(ctx, path, toPath, author)
        break
      case 'restore':
        if (!body.rev) return NextResponse.json({ error: 'Missing rev' }, { status: 400 })
        result = await restoreDocument(ctx, path, body.rev, author)
        break
      default:
        return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return toErrorResponse(e)
  }
}
