import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { getWorkspaceContext, searchWorkspace } from '@/lib/read-service'
import { ALL_VIEWS, type ViewName } from '@/lib/roles'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    const results = await searchWorkspace(ctx, q)
    return NextResponse.json({ results })
  } catch (e) { return toErrorResponse(e) }
}
