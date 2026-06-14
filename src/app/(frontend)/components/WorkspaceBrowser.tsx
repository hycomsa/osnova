'use client'

import Link from 'next/link'
import { FolderGit2, Plus, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/i18n/client'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'

interface Ws {
  id: string | number
  name: string
  slug: string
  defaultView?: string | null
  roles?: string[]
  memberCount?: number
  updatedAt?: string | null
}

export function WorkspaceBrowser() {
  const [workspaces, setWorkspaces] = useState<Ws[] | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [q, setQ] = useState('')
  const { t } = useTranslation()

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => (r.ok ? r.json() : { workspaces: [] }))
      .then((d) => { setWorkspaces(d.workspaces ?? []); setIsAdmin(Boolean(d.isSystemAdmin)) })
      .catch(() => setWorkspaces([]))
  }, [])

  const filtered = useMemo(() => {
    if (!workspaces) return []
    const ql = q.trim().toLowerCase()
    return ql ? workspaces.filter((w) => `${w.name} ${w.slug ?? ''}`.toLowerCase().includes(ql)) : workspaces
  }, [workspaces, q])

  if (workspaces === null)
    return <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</p>

  const newCard = isAdmin && (
    <Link
      href="/workspaces/new"
      className="flex min-h-[7rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
    >
      <Plus size={20} />
      {t('home.newWorkspace')}
    </Link>
  )

  if (workspaces.length === 0)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-2">
          {t('home.noWorkspaces')}
        </div>
        {newCard}
      </div>
    )

  return (
    <div className="space-y-4">
      {workspaces.length > 6 && (
        <div className="relative max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('home.search')}
            aria-label={t('home.search')}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">{t('home.noMatches')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => {
            const chips = (w.roles && w.roles.length ? w.roles : isAdmin ? ['__admin'] : [])
            return (
              <Link
                key={String(w.id)}
                href={`/ws/${w.slug || w.id}`}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 transition-all hover:border-primary/50 hover:bg-card hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FolderGit2 size={18} />
                  </div>
                  {w.slug && <Badge variant="outline" className="font-mono text-[10px]">{w.slug}</Badge>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium transition-colors group-hover:text-primary">{w.name}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {chips.map((r) => (
                    <span key={r} className="rounded-full bg-secondary px-1.5 py-0.5 font-medium text-foreground/70">
                      {r === '__admin' ? t('home.adminBadge') : t(`members.role.${r}`, r)}
                    </span>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1">
                    <Users size={12} /> {t('home.members', { count: w.memberCount ?? 0 })}
                  </span>
                </div>
              </Link>
            )
          })}
          {!q && newCard}
        </div>
      )}
    </div>
  )
}
