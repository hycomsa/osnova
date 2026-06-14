'use client'

import { AlertTriangle, Ban, ChevronDown, Eye, Shield, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'
import { dateTime } from '@/i18n/datetime'

type Status = 'approved' | 'rejected' | 'in_review'

interface State {
  status: Status | null
  revision: string | null
  note: string | null
  authorName: string | null
  authorEmail: string | null
  createdAt: string | null
  currentRevision: string | null
  stale: boolean
  canApprove: boolean
}

export function ApprovalControl({ workspaceId, view, path }: { workspaceId: string; view: string; path: string }) {
  const { t, i18n } = useTranslation()
  const [st, setSt] = useState<State | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)
  const q = `view=${encodeURIComponent(view)}&path=${encodeURIComponent(path)}`

  const load = useCallback(() => {
    fetch(`/api/ws/${workspaceId}/approval?${q}`).then((r) => (r.ok ? r.json() : null)).then(setSt).catch(() => setSt(null))
  }, [workspaceId, q])
  useEffect(() => { setSt(null); load() }, [load])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setRejecting(false) } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const act = async (status: Status, note?: string) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/ws/${workspaceId}/approval?view=${encodeURIComponent(view)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, status, note }),
      })
      if (r.ok) { setSt(await r.json()); setOpen(false); setRejecting(false); setRejectNote('') }
      else { const d = await r.json().catch(() => ({})); alert(d.message ?? d.error ?? `Błąd (${r.status})`) }
    } finally { setBusy(false) }
  }

  if (!st) return null

  // kolorystyka zależna od statusu; „w recenzji" celowo neutralne/dyskretne (krok opcjonalny)
  const pill = (() => {
    if (st.status === 'approved' && !st.stale) return { Icon: ShieldCheck, label: t('approval.approved'), cls: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
    if (st.status === 'approved' && st.stale) return { Icon: AlertTriangle, label: t('approval.approvedStale'), cls: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300' }
    if (st.status === 'rejected') return { Icon: Ban, label: t('approval.rejected'), cls: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300' }
    if (st.status === 'in_review') return { Icon: Eye, label: t('approval.inReview'), cls: 'border-border bg-transparent text-muted-foreground' }
    return { Icon: Shield, label: t('approval.none'), cls: 'border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300' }
  })()
  const PillIcon = pill.Icon

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium shadow-sm transition-[filter,background-color] hover:brightness-105 ${pill.cls}`} title={t('approval.title')}>
        <PillIcon size={13} className="shrink-0" />
        <span className="max-w-[9rem] truncate">{pill.label}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-border bg-popover/95 p-3 shadow-xl backdrop-blur">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('approval.title')}</div>
          {st.status ? (
            <div className="mt-1.5 text-sm">
              <div className="flex items-center gap-1.5">
                <PillIcon size={14} className={pill.cls.split(' ').filter((c) => c.startsWith('text-')).join(' ')} />
                <span>{pill.label}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{st.authorName || st.authorEmail} · {dateTime(st.createdAt, i18n.language)}</div>
              {st.note && <p className="mt-1 rounded-md bg-secondary/50 px-2 py-1 text-xs">{st.note}</p>}
              {st.stale && <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle size={12} /> {t('approval.staleWarn')}</p>}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">{t('approval.notApproved')}</p>
          )}
          {st.canApprove && (
            <div className="mt-3 space-y-2">
              {!rejecting ? (
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => act('approved')} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600/90 disabled:opacity-50">
                    {busy ? <Spinner /> : <ShieldCheck size={14} />} {t('approval.approve')}
                  </button>
                  <button disabled={busy} onClick={() => setRejecting(true)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-rose-500/50 px-2 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400">
                    <Ban size={14} /> {t('approval.reject')}
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder={t('approval.rejectPlaceholder')} rows={2} autoFocus
                    className="w-full resize-y rounded-md border border-input bg-background p-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => act('rejected', rejectNote)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-rose-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-600/90 disabled:opacity-50">
                      {busy ? <Spinner /> : <Ban size={14} />} {t('approval.reject')}
                    </button>
                    <button disabled={busy} onClick={() => { setRejecting(false); setRejectNote('') }} className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">{t('common.cancel')}</button>
                  </div>
                </div>
              )}
              {/* krok opcjonalny, dyskretny */}
              {!rejecting && st.status !== 'in_review' && (
                <button disabled={busy} onClick={() => act('in_review')} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
                  <Eye size={12} /> {t('approval.markInReview')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
