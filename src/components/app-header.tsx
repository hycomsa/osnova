'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/i18n/client'
import { OsnovaMark } from './osnova-mark'
import { NotificationsBell } from './notifications-bell'
import { UserMenu } from './user-menu'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

interface Ws { id: number | string; name: string; slug?: string }

// onSearch: gdy podany, w nagłówku pojawia się przycisk wyszukiwania (otwiera paletę ⌘K).
export function AppHeader({ workspace, onSearch }: { workspace?: { id?: string; name?: string; slug?: string }; onSearch?: () => void }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Ws[] | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const { t } = useTranslation()

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    fetch('/api/me').then((r) => r.json()).then((d) => setIsAdmin(Boolean(d.isSystemAdmin))).catch(() => {})
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

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

      <nav className="ml-auto flex items-center gap-1.5 text-sm sm:gap-2">
        {onSearch && (
          <button
            onClick={onSearch}
            title={t('viewer.search')}
            aria-label={t('viewer.search')}
            className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <Search size={14} />
            <span className="hidden md:inline">{t('viewer.search')}</span>
            <kbd className="hidden rounded border border-border bg-secondary/60 px-1 font-mono text-[10px] md:inline">⌘K</kbd>
          </button>
        )}
        {/* redundant na mobile (logo i switcher prowadzą do listy) — ukryj by nie ścieśniać nagłówka */}
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link href="/">{t('nav.workspaces')}</Link></Button>
        <NotificationsBell />
        <UserMenu />
      </nav>
    </header>
  )
}
