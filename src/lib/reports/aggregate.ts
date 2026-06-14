import type { DocStatus, ReportDoc } from './index'

export interface ReportFilters {
  docType?: string | null
  status?: DocStatus | null
  from?: string | null // ISO date (inclusive)
  to?: string | null // ISO date (inclusive)
}

export interface ReportTotals { inScope: number; approved: number; stale: number; changesRequested: number; pending: number }
export interface DocTypeRow { docType: string; approved: number; stale: number; changesRequested: number; pending: number; total: number }
export interface TimeBucket { bucket: string; acceptedInBucket: number; cumulativeApproved: number }
export interface ReportData {
  totals: ReportTotals
  byDocType: DocTypeRow[]
  overTime: TimeBucket[]
  docs: ReportDoc[]
}

export const NO_TYPE = '—' // dokumenty bez `doc-type`

const bucketOf = (iso: string) => iso.slice(0, 7) // YYYY-MM

// Czysta agregacja zbioru dokumentów (z indeksu) wg filtrów drill-downu.
// Filtr typu zawęża CAŁY raport (KPI/wykresy/tabela); filtr statusu i zakres dat
// dotyczą osi czasu i tabeli, ale KPI/byDocType pokazują pełny rozkład w danym typie.
export function aggregate(all: ReportDoc[], f: ReportFilters = {}): ReportData {
  const matchesType = (d: ReportDoc) => !f.docType || (d.docType ?? NO_TYPE) === f.docType
  const inRange = (iso: string | null) => {
    if (!iso) return true
    if (f.from && iso < f.from) return false
    if (f.to && iso > f.to) return false
    return true
  }

  const scoped = all.filter(matchesType)

  const totals: ReportTotals = { inScope: scoped.length, approved: 0, stale: 0, changesRequested: 0, pending: 0 }
  const typeMap = new Map<string, DocTypeRow>()
  const bump = (row: { approved: number; stale: number; changesRequested: number; pending: number }, s: DocStatus) => {
    if (s === 'approved') row.approved++
    else if (s === 'stale') row.stale++
    else if (s === 'changes_requested') row.changesRequested++
    else row.pending++
  }
  for (const d of scoped) {
    bump(totals, d.status)
    const key = d.docType ?? NO_TYPE
    let row = typeMap.get(key)
    if (!row) { row = { docType: key, approved: 0, stale: 0, changesRequested: 0, pending: 0, total: 0 }; typeMap.set(key, row) }
    row.total++
    bump(row, d.status)
  }
  const byDocType = [...typeMap.values()].sort((a, b) => b.total - a.total || a.docType.localeCompare(b.docType))

  // oś czasu: dokumenty kiedyś zaakceptowane (approved|stale) z datą, w zakresie dat
  const dated = scoped
    .filter((d) => (d.status === 'approved' || d.status === 'stale') && d.approvedAt && inRange(d.approvedAt))
    .map((d) => d.approvedAt!)
  const bucketMap = new Map<string, number>()
  for (const iso of dated) { const b = bucketOf(iso); bucketMap.set(b, (bucketMap.get(b) ?? 0) + 1) }
  const overTime: TimeBucket[] = []
  let cum = 0
  for (const b of [...bucketMap.keys()].sort()) { const n = bucketMap.get(b)!; cum += n; overTime.push({ bucket: b, acceptedInBucket: n, cumulativeApproved: cum }) }

  // tabela: filtr typu (już zastosowany) + statusu + zakres dat (dla zaakceptowanych)
  let docs = scoped
  if (f.status) docs = docs.filter((d) => d.status === f.status)
  docs = docs.filter((d) => (d.status === 'approved' || d.status === 'stale' ? inRange(d.approvedAt) : true))
  docs = docs.slice().sort((a, b) => a.title.localeCompare(b.title))

  return { totals, byDocType, overTime, docs }
}
