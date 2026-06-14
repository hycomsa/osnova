'use client'

import Link from 'next/link'
import { Bell, Check, ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'
import { relativeTime } from '@/i18n/datetime'

interface Notif {
  id: number | string
  type: string
  path?: string
  view?: string
  actorName?: string | null
  actorEmail?: string | null
  excerpt?: string | null
  read: boolean
  createdAt?: string
  workspaceSlug?: string
  workspaceName?: string
}

function hrefFor(n: Notif): string | null {
  if (!n.workspaceSlug || !n.path) return null
  const p = n.path.split('/').map(encodeURIComponent).join('/')
  return `/ws/${n.workspaceSlug}/${p}${n.view ? `?view=${encodeURIComponent(n.view)}` : ''}`
}

type TypeFilter = '' | 'mention' | 'reply' | 'approval'

export default function NotificationsInboxPage() {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [type, setType] = useState<TypeFilter>('')
  const [digest, setDigest] = useState<string>('daily')

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((d) => { if (d?.emailDigest) setDigest(d.emailDigest) }).catch(() => {})
  }, [])
  const changeDigest = (v: string) => {
    setDigest(v)
    fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emailDigest: v }) }).catch(() => {})
  }

  const load = useCallback((p: number, append: boolean) => {
    setLoading(true)
    const qs = new URLSearchParams({ page: String(p), limit: '30' })
    if (onlyUnread) qs.set('unread', '1')
    if (type) qs.set('type', type)
    fetch(`/api/notifications?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { notifications: [], unread: 0, totalPages: 1 }))
      .then((d) => {
        setItems((prev) => (append ? [...prev, ...(d.notifications ?? [])] : (d.notifications ?? [])))
        setUnread(d.unread ?? 0)
        setTotalPages(d.totalPages ?? 1)
        setPage(d.page ?? p)
      })
      .catch(() => { if (!append) setItems([]) })
      .finally(() => setLoading(false))
  }, [onlyUnread, type])

  useEffect(() => { load(1, false) }, [load])

  const markOne = (n: Notif) => {
    if (n.read) return
    fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) })
      .then(() => { setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))); setUnread((u) => Math.max(0, u - 1)) })
      .catch(() => {})
  }
  const markAll = () => {
    fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
      .then(() => { setItems((prev) => prev.map((n) => ({ ...n, read: true }))); setUnread(0) })
      .catch(() => {})
  }

  const verb = (n: Notif) => {
    if (n.type === 'reply') return t('notifications.replied')
    if (n.type === 'approval_approved') return t('notifications.approved')
    if (n.type === 'approval_changes') return t('notifications.changesRequested')
    if (n.type === 'approval') return n.excerpt || t('notifications.approvalFallback')
    return t('notifications.mentioned')
  }

  const tabs: { key: TypeFilter; label: string }[] = [
    { key: '', label: t('notifications.typeAll') },
    { key: 'mention', label: t('notifications.typeMention') },
    { key: 'reply', label: t('notifications.typeReply') },
    { key: 'approval', label: t('notifications.typeApproval') },
  ]

  return (
    <>
    <AppHeader />
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Bell size={22} className="text-accent" />
        <h1 className="text-xl font-semibold tracking-tight">{t('notifications.inbox')}</h1>
        {unread > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">{unread}</span>}
        {unread > 0 && (
          <button onClick={markAll} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Check size={13} /> {t('notifications.markAll')}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-border text-sm">
          {tabs.map((tb) => (
            <button key={tb.key || 'all'} onClick={() => setType(tb.key)}
              className={`px-3 py-1.5 transition-colors ${type === tb.key ? 'bg-secondary font-medium text-primary' : 'text-muted-foreground hover:bg-secondary/50'}`}>
              {tb.label}
            </button>
          ))}
        </div>
        <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
          {t('notifications.unread')}
        </label>
        <label className="inline-flex select-none items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{t('notifications.emailPrefs')}:</span>
          <select value={digest} onChange={(e) => changeDigest(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent">
            <option value="none">{t('notifications.digestOff')}</option>
            <option value="daily">{t('notifications.digestDaily')}</option>
            <option value="weekly">{t('notifications.digestWeekly')}</option>
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Bell size={30} className="opacity-30" />
            <p className="text-sm">{onlyUnread || type ? t('notifications.noneFiltered') : t('notifications.empty')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((n) => {
              const href = hrefFor(n)
              return (
                <li key={String(n.id)} className={`group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/30 ${n.read ? '' : 'bg-primary/[0.05]'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-accent'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{n.actorName || n.actorEmail || 'Osnova'}</span> {verb(n)}
                    </div>
                    {n.path && <div className="mt-0.5 truncate text-xs text-muted-foreground">{n.workspaceName ? `${n.workspaceName} · ` : ''}{n.path}</div>}
                    {n.type !== 'approval' && n.type !== 'approval_approved' && n.excerpt && (
                      <div className="mt-1 truncate text-xs text-muted-foreground/80">„{n.excerpt}"</div>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted-foreground/70">{relativeTime(n.createdAt, i18n.language, t('common.now'))}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {!n.read && (
                      <button onClick={() => markOne(n)} title={t('notifications.markRead')} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                        <Check size={14} />
                      </button>
                    )}
                    {href && (
                      <Link href={href} onClick={() => markOne(n)} title={t('notifications.open')} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
                        <ExternalLink size={14} />
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {page < totalPages && (
        <div className="mt-4 flex justify-center">
          <button onClick={() => load(page + 1, true)} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary disabled:opacity-50">
            {loading ? <Spinner /> : null} {t('notifications.loadMore')}
          </button>
        </div>
      )}
    </div>
    </>
  )
}
