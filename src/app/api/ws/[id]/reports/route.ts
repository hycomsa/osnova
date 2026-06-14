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
      approver: sp.get('approver') || null,
      from: sp.get('from') || null,
      to: sp.get('to') || null,
    }
    const idx = await getReportsIndex(payload, ctx)
    const data = aggregate(idx.docs, filters)
    // listy do filtrów, liczone z pełnego zbioru — niezależne od drill-downu
    const docTypes = [...new Set(idx.docs.map((d) => d.docType).filter((x): x is string => !!x))].sort()
    const apprMap = new Map<string, string | null>()
    for (const d of idx.docs) {
      if ((d.status === 'approved' || d.status === 'stale') && d.approvedBy && !apprMap.has(d.approvedBy)) apprMap.set(d.approvedBy, d.approvedByName)
    }
    const approvers = [...apprMap.entries()].map(([email, name]) => ({ email, name })).sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
    return NextResponse.json({ view, allowedViews: ctx.allowedViews, filters, docTypes, approvers, ...data })
  } catch (e) { return toErrorResponse(e) }
}
