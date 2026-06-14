'use client'

import Link from 'next/link'
import { BarChart3, Boxes, LayoutGrid, Search, Users } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/i18n/client'
import { OsnovaMark } from './osnova-mark'
import { NotificationsBell } from './notifications-bell'
import { UserMenu } from './user-menu'
import { Badge } from './ui/badge'

interface Ws { id: number | string; name: string; slug?: string }

// onSearch: gdy podany, w nagłówku pojawia się przycisk wyszukiwania (otwiera paletę ⌘K).
export function AppHeader({ workspace, onSearch }: { workspace?: { id?: string; name?: string; slug?: string }; onSearch?: () => void }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Ws[] | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [caps, setCaps] = useState<{ canManageMembers: boolean; canViewReports: boolean }>({ canManageMembers: false, canViewReports: false })
  const [tiles, setTiles] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const tilesRef = useRef<HTMLDivElement | null>(null)
  const { t } = useTranslation()

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
      if (tilesRef.current && !tilesRef.current.contains(e.target as Node)) setTiles(false)
    }
    document.addEventListener('mousedown', onDoc)
    fetch('/api/me').then((r) => r.json()).then((d) => setIsAdmin(Boolean(d.isSystemAdmin))).catch(() => {})
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (!workspace?.id) { setCaps({ canManageMembers: false, canViewReports: false }); return }
    fetch(`/api/ws/${workspace.id}/caps`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setCaps(d) }).catch(() => {})
  }, [workspace?.id])

  const toggleSwitcher = () => {
    setOpen((o) => !o)
    if (list === null) {
      fetch('/api/workspaces').then((r) => (r.ok ? r.json() : { workspaces: [] }))
        .then((d) => setList(d.workspaces ?? [])).catch(() => setList([]))
    }
  }

  return (
    <header className="app-header surface-chrome relative z-20 flex items-center gap-3 border-b border-border px-4 py-2.5">
      <Link href="/" className="flex items-center gap-2.5">
        <OsnovaMark />
        <span className="hidden flex-col leading-none sm:flex">
          <span className="text-sm font-light tracking-[0.25em]">osnova</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">git-native</span>
        </span>
      </Link>

      {workspace?.name && (
        <>
          <span className="text-muted-foreground/50">/</span>
          <div className="relative" ref={ref}>
            <button
              onClick={toggleSwitcher}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-secondary/60"
              title={t('nav.switchWorkspace')}
            >
              <span className="max-w-[120px] truncate font-medium sm:max-w-[200px]">{workspace.name}</span>
              {workspace.slug && <Badge variant="outline" className="hidden font-mono text-[10px] sm:inline-flex">{workspace.slug}</Badge>}
              <span className="text-muted-foreground">▾</span>
            </button>
            {open && (
              <div className="absolute left-0 z-30 mt-1 max-h-80 w-72 overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{t('nav.switchWorkspace')}</div>
                {list === null ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('common.loading')}</div>
                ) : list.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('home.noWorkspaces')}</div>
                ) : (
                  list.map((w) => {
                    const target = w.slug || String(w.id)
                    const isCurrent = target === workspace.slug || target === workspace.id
                    return (
                      <Link
                        key={String(w.id)}
                        href={`/ws/${target}`}
                        onClick={() => setOpen(false)}
                        className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary/60 ${isCurrent ? 'text-primary' : ''}`}
                      >
                        <span className="truncate">{w.name}</span>
                        {w.slug && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{w.slug}</span>}
                      </Link>
                    )
                  })
                )}
                <div className="mt-1 border-t border-border pt-1">
                  {isAdmin && (
                    <Link href="/workspaces/new" onClick={() => setOpen(false)} className="block rounded px-2 py-1.5 text-sm text-primary hover:bg-secondary/60">
                      {t('nav.newWorkspace')}
                    </Link>
                  )}
                  <Link href="/" onClick={() => setOpen(false)} className="block rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary/60">
                    {t('nav.allWorkspaces')}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Szeroki pasek wyszukiwania wypełniający wolną przestrzeń nagłówka (otwiera paletę ⌘K). */}
      {onSearch && (
        <button
          onClick={onSearch}
          title={t('viewer.search')}
          aria-label={t('viewer.search')}
          className="mx-2 flex min-w-0 max-w-2xl flex-1 items-center gap-2 rounded-md border border-input bg-background/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-ring/60 hover:bg-secondary/40 hover:text-foreground"
        >
          <Search size={15} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t('viewer.searchDocs')}</span>
          <kbd className="hidden shrink-0 rounded border border-border bg-secondary/60 px-1 font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>
      )}

      <nav className="ml-auto flex items-center gap-1.5 text-sm sm:gap-2">
        {/* kafelki nawigacyjne w stylu ribbona: Workspace'y / Członkowie / Raporty */}
        <div className="relative" ref={tilesRef}>
          <button
            onClick={() => setTiles((s) => !s)}
            title={t('nav.menu')} aria-label={t('nav.menu')} aria-haspopup="menu" aria-expanded={tiles}
            className={`flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:bg-secondary/60 hover:text-foreground ${tiles ? 'border-ring/60 bg-secondary/60 text-foreground' : ''}`}
          >
            <LayoutGrid size={15} />
            <span className="hidden sm:inline">{t('nav.menu')}</span>
          </button>
          {tiles && (
            <div className="absolute right-0 z-40 mt-1.5 w-[19rem] overflow-hidden rounded-xl border border-border bg-popover/95 p-2 shadow-xl backdrop-blur">
              <div className="grid grid-cols-1 gap-1.5">
                <NavTile href="/" icon={<Boxes size={18} />} title={t('nav.workspaces')} hint={t('nav.tileWorkspaces')} onClick={() => setTiles(false)} />
                {workspace?.id && caps.canManageMembers && (
                  <NavTile href={`/ws/${workspace.id}/members`} icon={<Users size={18} />} title={t('members.manage')} hint={t('nav.tileMembers')} onClick={() => setTiles(false)} />
                )}
                {workspace?.id && caps.canViewReports && (
                  <NavTile href={`/ws/${workspace.id}/reports`} icon={<BarChart3 size={18} />} title={t('reports.title')} hint={t('nav.tileReports')} onClick={() => setTiles(false)} />
                )}
              </div>
            </div>
          )}
        </div>
        <NotificationsBell />
        <UserMenu />
      </nav>
    </header>
  )
}

// Kafelek nawigacyjny w stylu osnovy (ikona w kafelku + tytuł + podpowiedź).
function NavTile({ href, icon, title, hint, onClick }: { href: string; icon: ReactNode; title: string; hint: string; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick}
      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-gradient-to-br from-secondary/40 to-transparent p-2.5 transition-colors hover:border-primary/40 hover:from-primary/10">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-background/70 text-primary ring-1 ring-border/60 transition-colors group-hover:ring-primary/40">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </Link>
  )
}
