'use client'

import Link from 'next/link'
import { Bell, Check } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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

export function NotificationsBell() {
  const [items, setItems] = useState<Notif[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const load = useCallback(() => {
    fetch('/api/notifications')
      .then((r) => (r.ok ? r.json() : { notifications: [], unread: 0 }))
      .then((d) => { setItems(d.notifications ?? []); setUnread(d.unread ?? 0) })
      .catch(() => { setItems([]); setUnread(0) })
  }, [])

  useEffect(() => {
    load()
    const t = window.setInterval(load, 60000) // odświeżaj co minutę
    return () => window.clearInterval(t)
  }, [load])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const { t, i18n } = useTranslation()
  const verb = (n: Notif) => {
    if (n.type === 'reply') return t('notifications.replied')
    if (n.type === 'approval_approved') return t('notifications.approved')
    if (n.type === 'approval_changes') return t('notifications.changesRequested')
    if (n.type === 'approval') return n.excerpt || t('notifications.approvalFallback')
    return t('notifications.mentioned')
  }
  const markAll = () => {
    fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
      .then(() => { setItems((prev) => (prev ?? []).map((n) => ({ ...n, read: true }))); setUnread(0) })
      .catch(() => {})
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('notifications.aria')}
        className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        aria-label={t('notifications.aria')}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover/95 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">{t('notifications.title')}</span>
            {unread > 0 && (
              <button onClick={markAll} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                <Check size={13} /> {t('notifications.markAll')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-auto">
            {items === null ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-muted-foreground">
                <Bell size={26} className="opacity-30" />
                <p className="text-sm">{t('notifications.empty')}</p>
              </div>
            ) : (
              items.map((n) => {
                const href = hrefFor(n)
                const inner = (
                  <div className={`flex flex-col gap-0.5 border-b border-border/60 px-3 py-2.5 transition-colors hover:bg-secondary/40 ${n.read ? '' : 'bg-primary/[0.06]'}`}>
                    <div className="flex items-center gap-2 text-sm">
                      {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      <span className="truncate">
                        <span className="font-medium">{n.actorName || n.actorEmail || 'Ktoś'}</span>{' '}
                        {verb(n)}
                      </span>
                    </div>
                    {n.path && <div className="truncate text-[11px] text-muted-foreground">{n.workspaceName ? `${n.workspaceName} · ` : ''}{n.path.split('/').pop()}</div>}
                    {n.type !== 'approval' && n.type !== 'approval_approved' && n.excerpt && <div className="truncate text-xs text-muted-foreground/80">„{n.excerpt}”</div>}
                    <div className="text-[11px] text-muted-foreground/70">{relativeTime(n.createdAt, i18n.language, t('common.now'))}</div>
                  </div>
                )
                return href ? (
                  <Link key={String(n.id)} href={href} onClick={() => setOpen(false)}>{inner}</Link>
                ) : (
                  <div key={String(n.id)}>{inner}</div>
                )
              })
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)}
            className="block border-t border-border px-3 py-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-primary">
            {t('notifications.viewAll')}
          </Link>
        </div>
      )}
    </div>
  )
}
