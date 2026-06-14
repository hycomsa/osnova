'use client'

import { AlertTriangle, RotateCcw, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'
import { dateTime } from '@/i18n/datetime'

interface State {
  status: 'approved' | 'changes_requested' | null
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
  const ref = useRef<HTMLDivElement | null>(null)
  const q = `view=${encodeURIComponent(view)}&path=${encodeURIComponent(path)}`

  const load = useCallback(() => {
    fetch(`/api/ws/${workspaceId}/approval?${q}`).then((r) => (r.ok ? r.json() : null)).then(setSt).catch(() => setSt(null))
  }, [workspaceId, q])
  useEffect(() => { setSt(null); load() }, [load])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const act = async (status: 'approved' | 'changes_requested') => {
    let note: string | undefined
    if (status === 'changes_requested') {
      const n = window.prompt(t('approval.changePrompt'))
      if (n === null) return
      note = n
    }
    setBusy(true)
    try {
      const r = await fetch(`/api/ws/${workspaceId}/approval?view=${encodeURIComponent(view)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, status, note }),
      })
      if (r.ok) { setSt(await r.json()); setOpen(false) }
      else { const d = await r.json().catch(() => ({})); alert(d.message ?? d.error ?? `Błąd (${r.status})`) }
    } finally { setBusy(false) }
  }

  if (!st) return null

  const pill = (() => {
    if (st.status === 'approved' && !st.stale) return { Icon: ShieldCheck, label: t('approval.approved'), cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
    if (st.status === 'approved' && st.stale) return { Icon: AlertTriangle, label: t('approval.approvedStale'), cls: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400' }
    if (st.status === 'changes_requested') return { Icon: ShieldAlert, label: t('approval.changesRequested'), cls: 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400' }
    return { Icon: Shield, label: t('approval.none'), cls: 'border-border text-muted-foreground' }
  })()
  const PillIcon = pill.Icon

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors hover:bg-secondary/60 ${pill.cls}`} title={t('approval.title')}>
        <PillIcon size={13} />
        <span className="hidden md:inline">{pill.label}</span>
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
            <div className="mt-3 flex gap-2">
              <button disabled={busy} onClick={() => act('approved')} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600/90 disabled:opacity-50">
                {busy ? <Spinner /> : <ShieldCheck size={14} />} {t('approval.approve')}
              </button>
              <button disabled={busy} onClick={() => act('changes_requested')} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50">
                <RotateCcw size={14} /> {t('approval.requestChanges')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
