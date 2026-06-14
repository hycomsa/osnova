import { describe, expect, it } from 'vitest'
import { aggregate, NO_TYPE } from '@/lib/reports/aggregate'
import type { ReportDoc } from '@/lib/reports'

const D = (path: string, docType: string | null, status: ReportDoc['status'], approvedAt: string | null = null, by: string | null = null, name: string | null = null): ReportDoc =>
  ({ path, title: path, docType, status, approvedBy: by ?? (status === 'approved' || status === 'stale' ? 'k@x.pl' : null), approvedByName: name, approvedAt })

const DOCS: ReportDoc[] = [
  D('a/func1.md', 'func-spec', 'approved', '2026-01-15T10:00:00Z', 'ann@x.pl', 'Ann'),
  D('a/func2.md', 'func-spec', 'pending'),
  D('b/intent1.md', 'intent-spec', 'approved', '2026-02-10T10:00:00Z', 'bob@x.pl', 'Bob'),
  D('b/intent2.md', 'intent-spec', 'stale', '2026-01-20T10:00:00Z', 'ann@x.pl', 'Ann'),
  D('c/req1.md', 'requirements-notes', 'rejected', null, 'bob@x.pl', 'Bob'),
  D('d/loose.md', null, 'pending'),
  D('e/note.md', 'technical-notes', 'in_review', null, 'ann@x.pl', 'Ann'),
]

describe('reports aggregate', () => {
  it('totals across the whole view', () => {
    const r = aggregate(DOCS)
    expect(r.totals).toEqual({ inScope: 7, approved: 2, stale: 1, rejected: 1, inReview: 1, pending: 2 })
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
    expect(r.totals.inScope).toBe(7) // KPI niezmienione
    expect(r.docs.map((d) => d.path).sort()).toEqual(['a/func1.md', 'b/intent1.md'])
  })

  it('byApprover counts accepted only (approved+stale), per person', () => {
    const r = aggregate(DOCS)
    expect(r.byApprover).toEqual([
      { approver: 'ann@x.pl', name: 'Ann', accepted: 2, total: 2 }, // func1 + intent2
      { approver: 'bob@x.pl', name: 'Bob', accepted: 1, total: 1 }, // intent1 (changes-requested req1 NOT counted)
    ])
  })

  it('statusApprovers: approved/stale split per person; rejected/in_review/pending pass through as one null segment', () => {
    const r = aggregate(DOCS)
    const approved = r.statusApprovers.filter((s) => s.status === 'approved')
    expect(approved.map((s) => s.approver).sort()).toEqual(['ann@x.pl', 'bob@x.pl'])
    const stale = r.statusApprovers.filter((s) => s.status === 'stale')
    expect(stale).toEqual([{ status: 'stale', approver: 'ann@x.pl', name: 'Ann', count: 1 }])
    expect(r.statusApprovers.find((s) => s.status === 'rejected')).toEqual({ status: 'rejected', approver: null, name: null, count: 1 })
    expect(r.statusApprovers.find((s) => s.status === 'in_review')).toEqual({ status: 'in_review', approver: null, name: null, count: 1 })
    expect(r.statusApprovers.find((s) => s.status === 'pending')).toEqual({ status: 'pending', approver: null, name: null, count: 2 })
  })

  it('drill by approver re-scopes the report and drops pending', () => {
    const r = aggregate(DOCS, { approver: 'ann@x.pl' })
    expect(r.totals).toEqual({ inScope: 3, approved: 1, stale: 1, rejected: 0, inReview: 1, pending: 0 })
    expect(r.docs.map((d) => d.path).sort()).toEqual(['a/func1.md', 'b/intent2.md', 'e/note.md'])
    expect(r.byApprover).toEqual([{ approver: 'ann@x.pl', name: 'Ann', accepted: 2, total: 2 }])
  })

  it('date range filters timeline + accepted rows, keeps pending/rejected/in-review rows', () => {
    const r = aggregate(DOCS, { from: '2026-02-01' })
    expect(r.overTime).toEqual([{ bucket: '2026-02', acceptedInBucket: 1, cumulativeApproved: 1 }])
    expect(r.docs.map((d) => d.path).sort()).toEqual(['a/func2.md', 'b/intent1.md', 'c/req1.md', 'd/loose.md', 'e/note.md'])
  })
})
