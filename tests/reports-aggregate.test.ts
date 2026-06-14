import { describe, expect, it } from 'vitest'
import { aggregate, NO_TYPE } from '@/lib/reports/aggregate'
import type { ReportDoc } from '@/lib/reports'

const D = (path: string, docType: string | null, status: ReportDoc['status'], approvedAt: string | null = null): ReportDoc =>
  ({ path, title: path, docType, status, approvedBy: status === 'approved' || status === 'stale' ? 'k@x.pl' : null, approvedAt })

const DOCS: ReportDoc[] = [
  D('a/func1.md', 'func-spec', 'approved', '2026-01-15T10:00:00Z'),
  D('a/func2.md', 'func-spec', 'pending'),
  D('b/intent1.md', 'intent-spec', 'approved', '2026-02-10T10:00:00Z'),
  D('b/intent2.md', 'intent-spec', 'stale', '2026-01-20T10:00:00Z'),
  D('c/req1.md', 'requirements-notes', 'changes_requested'),
  D('d/loose.md', null, 'pending'),
]

describe('reports aggregate', () => {
  it('totals across the whole view', () => {
    const r = aggregate(DOCS)
    expect(r.totals).toEqual({ inScope: 6, approved: 2, stale: 1, changesRequested: 1, pending: 2 })
  })

  it('byDocType breakdown (sorted by total desc), null type → NO_TYPE bucket', () => {
    const r = aggregate(DOCS)
    const func = r.byDocType.find((x) => x.docType === 'func-spec')!
    expect(func).toMatchObject({ approved: 1, pending: 1, total: 2 })
    const intent = r.byDocType.find((x) => x.docType === 'intent-spec')!
    expect(intent).toMatchObject({ approved: 1, stale: 1, total: 2 })
    expect(r.byDocType.find((x) => x.docType === NO_TYPE)).toMatchObject({ pending: 1, total: 1 })
  })

  it('overTime buckets by month with running cumulative (approved|stale with a date)', () => {
    const r = aggregate(DOCS)
    expect(r.overTime).toEqual([
      { bucket: '2026-01', acceptedInBucket: 2, cumulativeApproved: 2 },
      { bucket: '2026-02', acceptedInBucket: 1, cumulativeApproved: 3 },
    ])
  })

  it('drill by docType scopes the whole report', () => {
    const r = aggregate(DOCS, { docType: 'func-spec' })
    expect(r.totals.inScope).toBe(2)
    expect(r.byDocType).toHaveLength(1)
    expect(r.docs.map((d) => d.path)).toEqual(['a/func1.md', 'a/func2.md'])
  })

  it('drill by status filters the table but keeps full KPI distribution', () => {
    const r = aggregate(DOCS, { status: 'approved' })
    expect(r.totals.inScope).toBe(6) // KPI niezmienione
    expect(r.docs.map((d) => d.path).sort()).toEqual(['a/func1.md', 'b/intent1.md'])
  })

  it('date range filters timeline + accepted rows, keeps pending/changes rows', () => {
    const r = aggregate(DOCS, { from: '2026-02-01' })
    expect(r.overTime).toEqual([{ bucket: '2026-02', acceptedInBucket: 1, cumulativeApproved: 1 }])
    expect(r.docs.map((d) => d.path).sort()).toEqual(['a/func2.md', 'b/intent1.md', 'c/req1.md', 'd/loose.md'])
  })
})
