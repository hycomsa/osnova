import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { getWorkspaceContext } from '@/lib/read-service'
import { ALL_VIEWS, hasPermission, type ViewName } from '@/lib/roles'
import { getReportsIndex } from '@/lib/reports'
import { aggregate, type ReportFilters } from '@/lib/reports/aggregate'
import type { DocStatus } from '@/lib/reports'

const STATUSES: DocStatus[] = ['approved', 'changes_requested', 'pending', 'stale']

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const view = (sp.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    if (!hasPermission(ctx.permissions, 'reports-view', ctx.isSystemAdmin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const statusParam = sp.get('status')
    const filters: ReportFilters = {
      docType: sp.get('docType') || null,
      status: statusParam && STATUSES.includes(statusParam as DocStatus) ? (statusParam as DocStatus) : null,
      from: sp.get('from') || null,
      to: sp.get('to') || null,
    }
    const idx = await getReportsIndex(payload, ctx)
    const data = aggregate(idx.docs, filters)
    // lista typów dokumentów (do filtra), liczona z pełnego zbioru — niezależnie od drill-downu
    const docTypes = [...new Set(idx.docs.map((d) => d.docType).filter((x): x is string => !!x))].sort()
    return NextResponse.json({ view, allowedViews: ctx.allowedViews, filters, docTypes, ...data })
  } catch (e) { return toErrorResponse(e) }
}
