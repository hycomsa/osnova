'use client'

import { useTheme } from 'next-themes'
import { Activity, ChevronDown, LogOut, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LanguageSwitcher, useTranslation } from '@/i18n/client'
import { Avatar } from './ui/avatar'

interface Me { authenticated: boolean; email?: string; name?: string | null; isSystemAdmin?: boolean }

const THEMES = [
  { v: 'system', tkey: 'theme.auto', Icon: Monitor },
  { v: 'light', tkey: 'theme.light', Icon: Sun },
  { v: 'dark', tkey: 'theme.dark', Icon: Moon },
] as const

export function UserMenu() {
  const { t } = useTranslation()
  const [me, setMe] = useState<Me | null>(null)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then(setMe).catch(() => setMe({ authenticated: false }))
  }, [])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [])

  if (!me?.authenticated) return null
  const current = mounted ? (theme ?? 'system') : null
  const name = me.name || me.email?.split('@')[0] || 'Użytkownik'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 outline-none transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
        title={me.email}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={me.name} email={me.email} />
        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 origin-top-right overflow-hidden rounded-xl border border-border bg-popover/95 shadow-xl backdrop-blur" role="menu">
          {/* tożsamość */}
          <div className="flex items-center gap-3 border-b border-border p-3">
            <Avatar name={me.name} email={me.email} size={42} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{name}</div>
              <div className="truncate text-xs text-muted-foreground">{me.email}</div>
              {me.isSystemAdmin && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  <ShieldCheck size={11} /> {t('user.sysadmin')}
                </span>
              )}
            </div>
          </div>

          {/* język */}
          <div className="p-2">
            <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{t('lang.language')}</div>
            <LanguageSwitcher />
          </div>

          {/* motyw */}
          <div className="px-2 pb-2">
            <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{t('theme.theme')}</div>
            <div className="flex gap-1 rounded-lg bg-secondary/50 p-0.5">
              {THEMES.map(({ v, tkey, Icon }) => (
                <button
                  key={v}
                  onClick={() => setTheme(v)}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-md py-1.5 text-[11px] transition-colors ${current === v ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon size={15} />
                  {t(tkey)}
                </button>
              ))}
            </div>
          </div>

          {/* akcje */}
          {me.isSystemAdmin && (
            <div className="border-t border-border p-1">
              <a href="/admin" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60" role="menuitem">
                <ShieldCheck size={15} className="text-muted-foreground" />
                {t('nav.admin')}
              </a>
              <a href="/ai-health" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60" role="menuitem">
                <Activity size={15} className="text-muted-foreground" />
                {t('aihealth.nav')}
              </a>
            </div>
          )}

          <div className="border-t border-border p-1">
            <a href="/api/auth/logout" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10" role="menuitem">
              <LogOut size={15} />
              {t('auth.logout')}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
