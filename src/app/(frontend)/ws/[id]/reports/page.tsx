'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, BarChart3, ChevronRight, FileText, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'
import { type ApproverSeg, ByTypeBars, OverTime, StatusApproverDonut, StatusPie, STATUS_COLOR, type StatusKey } from '@/app/(frontend)/components/reports/Charts'

interface ReportDoc { path: string; title: string; docType: string | null; status: StatusKey; approvedBy: string | null; approvedByName: string | null; approvedAt: string | null }
interface TypeRow { docType: string; approved: number; stale: number; rejected: number; inReview: number; pending: number; total: number }
interface ApproverRow { approver: string; name: string | null; accepted: number; total: number }
interface ReportData {
  view: string
  allowedViews: string[]
  docTypes: string[]
  approvers: { email: string; name: string | null }[]
  totals: { inScope: number; approved: number; stale: number; rejected: number; inReview: number; pending: number }
  byDocType: TypeRow[]
  byApprover: ApproverRow[]
  statusApprovers: ApproverSeg[]
  overTime: { bucket: string; acceptedInBucket: number; cumulativeApproved: number }[]
  docs: ReportDoc[]
}

const CANDIDATE_VIEWS = ['direct', 'client_business', 'client_technical']

export default function ReportsPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const sp = useSearchParams()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  const view = sp.get('view')
  const docType = sp.get('docType')
  const status = sp.get('status') as StatusKey | null
  const approver = sp.get('approver')
  const from = sp.get('from')
  const to = sp.get('to')

  const setParams = useCallback((patch: Record<string, string | null>, opts?: { replace?: boolean }) => {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') q.delete(k); else q.set(k, v) }
    const url = `/ws/${id}/reports?${q.toString()}`
    if (opts?.replace) router.replace(url); else router.push(url)
  }, [id, sp, router])

  const load = useCallback(async () => {
    setLoading(true); setDenied(false)
    const candidates = view ? [view] : CANDIDATE_VIEWS
    for (const v of candidates) {
      const q = new URLSearchParams({ view: v })
      if (docType) q.set('docType', docType)
      if (status) q.set('status', status)
      if (approver) q.set('approver', approver)
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      const r = await fetch(`/api/ws/${id}/reports?${q.toString()}`)
      if (r.status === 403) { setDenied(true); setData(null); setLoading(false); return }
      if (r.status === 400) continue
      if (r.ok) {
        const d = (await r.json()) as ReportData
        setData(d); setLoading(false)
        if (!view) setParams({ view: d.view }, { replace: true }) // utrwal widok w URL (shareable)
        return
      }
    }
    setData(null); setLoading(false)
  }, [id, view, docType, status, approver, from, to, setParams])
  useEffect(() => { void load() }, [load])

  const statusLabels: Record<StatusKey, string> = useMemo(() => ({
    approved: t('reports.statusApproved'), stale: t('reports.statusStale'),
    rejected: t('reports.statusRejected'), in_review: t('reports.statusInReview'), pending: t('reports.statusPending'),
  }), [t, i18n.language])

  const acceptedPct = data && data.totals.inScope > 0 ? Math.round((data.totals.approved / data.totals.inScope) * 100) : 0
  const filterActive = Boolean(docType || status || approver || from || to)
  const approverName = (email: string) => data?.approvers.find((a) => a.email === email)?.name || email

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader workspace={{ id }} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><BarChart3 size={20} className="text-primary" /> {t('reports.title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('reports.subtitle')}</p>
          </div>
          <Link href={`/ws/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> {t('reports.back')}</Link>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</p>
        ) : denied ? (
          <p className="py-16 text-sm text-muted-foreground">{t('reports.denied')}</p>
        ) : !data ? (
          <p className="py-16 text-sm text-muted-foreground">{t('reports.empty')}</p>
        ) : (
          <>
            {/* filtry */}
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card/40 p-3">
              <Field label={t('reports.view')}>
                <select value={data.view} onChange={(e) => setParams({ view: e.target.value, docType: null, status: null, approver: null })} className={selCls}>
                  {data.allowedViews.map((v) => <option key={v} value={v}>{t(`views.${v}`)}</option>)}
                </select>
              </Field>
              <Field label={t('reports.docType')}>
                <select value={docType ?? ''} onChange={(e) => setParams({ docType: e.target.value || null })} className={selCls}>
                  <option value="">{t('reports.allTypes')}</option>
                  {data.docTypes.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
                </select>
              </Field>
              <Field label={t('reports.status')}>
                <select value={status ?? ''} onChange={(e) => setParams({ status: e.target.value || null })} className={selCls}>
                  <option value="">{t('reports.allStatuses')}</option>
                  {(['approved', 'stale', 'rejected', 'in_review', 'pending'] as StatusKey[]).map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
                </select>
              </Field>
              <Field label={t('reports.approver')}>
                <select value={approver ?? ''} onChange={(e) => setParams({ approver: e.target.value || null })} className={selCls}>
                  <option value="">{t('reports.allApprovers')}</option>
                  {data.approvers.map((a) => <option key={a.email} value={a.email}>{a.name || a.email}</option>)}
                </select>
              </Field>
              <Field label={t('reports.from')}><input type="date" value={from ?? ''} onChange={(e) => setParams({ from: e.target.value || null })} className={selCls} /></Field>
              <Field label={t('reports.to')}><input type="date" value={to ?? ''} onChange={(e) => setParams({ to: e.target.value || null })} className={selCls} /></Field>
              {filterActive && (
                <button onClick={() => setParams({ docType: null, status: null, approver: null, from: null, to: null })} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <X size={14} /> {t('reports.clearFilters')}
                </button>
              )}
            </div>

            {/* breadcrumb drill-downu */}
            {(docType || status || approver) && (
              <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <button onClick={() => setParams({ docType: null, status: null, approver: null })} className="hover:text-foreground">{t('reports.breadcrumbAll')}</button>
                {docType && (<><ChevronRight size={14} className="opacity-50" /><button onClick={() => setParams({ docType: null })} className="font-medium text-foreground hover:underline">{docType}</button></>)}
                {status && (<><ChevronRight size={14} className="opacity-50" /><button onClick={() => setParams({ status: null })} className="font-medium text-foreground hover:underline">{statusLabels[status]}</button></>)}
                {approver && (<><ChevronRight size={14} className="opacity-50" /><span className="font-medium text-foreground">{approverName(approver)}</span></>)}
              </nav>
            )}

            {/* KPI */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <Kpi label={t('reports.kpiInScope')} value={data.totals.inScope} />
              <Kpi label={t('reports.kpiAcceptedPct')} value={`${acceptedPct}%`} accent={STATUS_COLOR.approved} />
              <Kpi label={t('reports.kpiAccepted')} value={data.totals.approved} accent={STATUS_COLOR.approved} />
              <Kpi label={t('reports.kpiInReview')} value={data.totals.inReview} accent={STATUS_COLOR.in_review} />
              <Kpi label={t('reports.kpiPending')} value={data.totals.pending} accent={STATUS_COLOR.pending} />
              <Kpi label={t('reports.kpiRejected')} value={data.totals.rejected} accent={STATUS_COLOR.rejected} />
              <Kpi label={t('reports.kpiStale')} value={data.totals.stale} accent={STATUS_COLOR.stale} />
              <Kpi label={t('reports.kpiApprovers')} value={data.byApprover.length} />
            </div>

            {/* wykresy */}
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Panel title={t('reports.chartStatus')}>
                <div className="h-64">
                  <StatusPie
                    data={[
                      { key: 'approved', label: statusLabels.approved, value: data.totals.approved },
                      { key: 'stale', label: statusLabels.stale, value: data.totals.stale },
                      { key: 'rejected', label: statusLabels.rejected, value: data.totals.rejected },
                      { key: 'in_review', label: statusLabels.in_review, value: data.totals.inReview },
                      { key: 'pending', label: statusLabels.pending, value: data.totals.pending },
                    ]}
                    onSelect={(k) => setParams({ status: status === k ? null : k })}
                  />
                </div>
              </Panel>
              <Panel title={t('reports.chartApprovers')}>
                <div className="h-64">
                  <StatusApproverDonut
                    statusData={[
                      { key: 'approved', label: statusLabels.approved, value: data.totals.approved },
                      { key: 'stale', label: statusLabels.stale, value: data.totals.stale },
                      { key: 'rejected', label: statusLabels.rejected, value: data.totals.rejected },
                      { key: 'in_review', label: statusLabels.in_review, value: data.totals.inReview },
                      { key: 'pending', label: statusLabels.pending, value: data.totals.pending },
                    ]}
                    segs={data.statusApprovers}
                    noApproverLabel={t('reports.noApprover')}
                    onSelectStatus={(k) => setParams({ status: status === k ? null : k })}
                    onSelectApprover={(a) => setParams({ approver: approver === a ? null : a })}
                  />
                </div>
                {data.byApprover.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {data.byApprover.map((a) => (
                      <button key={a.approver} onClick={() => setParams({ approver: approver === a.approver ? null : a.approver })} title={a.approver}
                        className={`inline-flex items-center gap-1.5 hover:text-foreground ${approver === a.approver ? 'font-medium text-foreground' : ''}`}>
                        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.approved }} />
                        {a.name || a.approver} · {a.accepted}
                      </button>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
            <Panel title={t('reports.chartOverTime')} className="mb-5">
              <div className="h-64"><OverTime data={data.overTime} cumulativeLabel={t('reports.cumulative')} /></div>
            </Panel>

            <Panel title={t('reports.chartByType')} className="mb-5">
              <div className="h-72"><ByTypeBars data={data.byDocType} labels={statusLabels} onSelect={(dt) => setParams({ docType: docType === dt ? null : dt, status: null })} /></div>
            </Panel>

            {/* tabela */}
            <Panel title={`${t('reports.tableTitle')} (${data.docs.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2 font-medium">{t('reports.colDoc')}</th>
                      <th className="px-2 py-2 font-medium">{t('reports.colType')}</th>
                      <th className="px-2 py-2 font-medium">{t('reports.colStatus')}</th>
                      <th className="px-2 py-2 font-medium">{t('reports.colBy')}</th>
                      <th className="px-2 py-2 font-medium">{t('reports.colAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.docs.map((d) => (
                      <tr key={d.path} className="border-b border-border/50 hover:bg-secondary/40">
                        <td className="px-2 py-2">
                          <Link href={`/ws/${id}/${d.path}?view=${data.view}`} className="inline-flex items-center gap-1.5 text-foreground hover:text-primary hover:underline">
                            <FileText size={13} className="shrink-0 text-muted-foreground" /> {d.title}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{d.docType ?? <span className="opacity-50">{t('reports.noType')}</span>}</td>
                        <td className="px-2 py-2"><StatusPill s={d.status} label={statusLabels[d.status]} /></td>
                        <td className="px-2 py-2 text-muted-foreground" title={d.approvedBy ?? undefined}>{d.approvedByName ?? d.approvedBy ?? '—'}</td>
                        <td className="px-2 py-2 text-muted-foreground">{d.approvedAt ? new Date(d.approvedAt).toLocaleDateString(i18n.language) : '—'}</td>
                      </tr>
                    ))}
                    {data.docs.length === 0 && <tr><td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">{t('reports.empty')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </main>
    </div>
  )
}

const selCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}{children}</label>
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <div className="text-2xl font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card/40 p-4 ${className ?? ''}`}>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

function StatusPill({ s, label }: { s: StatusKey; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs" style={{ background: `${STATUS_COLOR[s]}22`, color: STATUS_COLOR[s] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} /> {label}
    </span>
  )
}
