'use client'

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

export type StatusKey = 'approved' | 'stale' | 'changes_requested' | 'pending'

// kolory statusów — czytelne w trybie jasnym i ciemnym
export const STATUS_COLOR: Record<StatusKey, string> = {
  approved: '#10b981',
  stale: '#f59e0b',
  changes_requested: '#ef4444',
  pending: '#94a3b8',
}

const tooltipStyle = {
  contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: 'hsl(var(--foreground))' },
}

export interface PieDatum { key: StatusKey; label: string; value: number }
export function StatusPie({ data, onSelect }: { data: PieDatum[]; onSelect?: (k: StatusKey) => void }) {
  const shown = data.filter((d) => d.value > 0)
  if (shown.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={shown} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="80%" paddingAngle={2}
          onClick={(e: any) => onSelect?.(e?.payload?.key as StatusKey)} cursor={onSelect ? 'pointer' : undefined}>
          {shown.map((d) => <Cell key={d.key} fill={STATUS_COLOR[d.key]} stroke="hsl(var(--background))" strokeWidth={2} />)}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export interface TimeDatum { bucket: string; cumulativeApproved: number; acceptedInBucket: number }
export function OverTime({ data, cumulativeLabel }: { data: TimeDatum[]; cumulativeLabel: string }) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={STATUS_COLOR.approved} stopOpacity={0.35} />
            <stop offset="100%" stopColor={STATUS_COLOR.approved} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip {...tooltipStyle} />
        <Area type="monotone" dataKey="cumulativeApproved" name={cumulativeLabel} stroke={STATUS_COLOR.approved} fill="url(#accGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export interface ApproverSeg { status: StatusKey; approver: string | null; name: string | null; count: number }
// Dwupierścieniowy donut: środek = rozkład statusów, zewnętrzny pierścień = osoby akceptujące per status.
export function StatusApproverDonut({ statusData, segs, noApproverLabel, onSelectApprover, onSelectStatus }: {
  statusData: PieDatum[]
  segs: ApproverSeg[]
  noApproverLabel: string
  onSelectApprover?: (email: string) => void
  onSelectStatus?: (k: StatusKey) => void
}) {
  const inner = statusData.filter((d) => d.value > 0)
  if (inner.length === 0) return null
  // opacity różnicuje osoby w obrębie jednego statusu (kolor = status)
  const fills: number[] = []
  let last = ''
  let idx = 0
  for (const s of segs) { if (s.status !== last) { last = s.status; idx = 0 } else idx++; fills.push(s.approver ? Math.max(0.4, 1 - idx * 0.16) : 0.85) }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={inner} dataKey="value" nameKey="label" outerRadius="52%" onClick={(e: any) => onSelectStatus?.(e?.payload?.key as StatusKey)} cursor={onSelectStatus ? 'pointer' : undefined}>
          {inner.map((d) => <Cell key={d.key} fill={STATUS_COLOR[d.key]} stroke="hsl(var(--background))" strokeWidth={2} />)}
        </Pie>
        <Pie data={segs} dataKey="count" nameKey="name" innerRadius="56%" outerRadius="82%" paddingAngle={1}
          onClick={(e: any) => { const a = e?.payload?.approver; if (a) onSelectApprover?.(a) }} cursor={onSelectApprover ? 'pointer' : undefined}>
          {segs.map((s, i) => <Cell key={i} fill={STATUS_COLOR[s.status]} fillOpacity={fills[i]} stroke="hsl(var(--background))" strokeWidth={1} />)}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v: any, _n: any, p: any) => [v, p?.payload?.name || p?.payload?.label || noApproverLabel]} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export interface TypeDatum { docType: string; approved: number; stale: number; changesRequested: number; pending: number; total: number }
export function ByTypeBars({ data, labels, onSelect }: {
  data: TypeDatum[]
  labels: Record<StatusKey, string>
  onSelect?: (docType: string) => void
}) {
  if (data.length === 0) return null
  const click = (e: any) => { const dt = e?.activePayload?.[0]?.payload?.docType; if (dt && onSelect) onSelect(dt) }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} onClick={click}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
        <XAxis dataKey="docType" tick={{ fontSize: 11 }} interval={0} angle={data.length > 6 ? -20 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 54 : 30} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip {...tooltipStyle} cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="approved" stackId="s" name={labels.approved} fill={STATUS_COLOR.approved} cursor={onSelect ? 'pointer' : undefined} />
        <Bar dataKey="stale" stackId="s" name={labels.stale} fill={STATUS_COLOR.stale} cursor={onSelect ? 'pointer' : undefined} />
        <Bar dataKey="changesRequested" stackId="s" name={labels.changes_requested} fill={STATUS_COLOR.changes_requested} cursor={onSelect ? 'pointer' : undefined} />
        <Bar dataKey="pending" stackId="s" name={labels.pending} fill={STATUS_COLOR.pending} cursor={onSelect ? 'pointer' : undefined} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
