import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { getDocGraph } from '@/lib/doc-graph'
import { toErrorResponse } from '@/lib/http'
import { getWorkspaceContext } from '@/lib/read-service'
import { ALL_VIEWS, type ViewName } from '@/lib/roles'

// Graf zależności (linków) dokumentu — do wizualizacji orbitalnej. Zakres widoku
// egzekwowany serwerowo: graf budowany tylko z plików widocznych w danym widoku.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  const path = req.nextUrl.searchParams.get('path') ?? ''
  const depth = Number(req.nextUrl.searchParams.get('depth') ?? '2')
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    return NextResponse.json(await getDocGraph(ctx, path, depth))
  } catch (e) {
    return toErrorResponse(e)
  }
}
