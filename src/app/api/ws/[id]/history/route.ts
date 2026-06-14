import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { getDocumentAtRevision, getHistory, getWorkspaceContext } from '@/lib/read-service'
import { ALL_VIEWS, type ViewName } from '@/lib/roles'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  const path = req.nextUrl.searchParams.get('path') ?? ''
  const rev = req.nextUrl.searchParams.get('rev') ?? ''
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    if (rev) {
      const doc = await getDocumentAtRevision(ctx, path, rev)
      if (doc.kind === 'markdown') return NextResponse.json({ kind: 'markdown', html: doc.html })
      return NextResponse.json({ kind: 'text', content: doc.data.toString('utf8') })
    }
    const revisions = await getHistory(ctx, path)
    return NextResponse.json({ revisions })
  } catch (e) { return toErrorResponse(e) }
}
