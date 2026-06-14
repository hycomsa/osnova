'use client'

import Link from 'next/link'
import { Activity, ArrowLeft, CheckCircle2, CircleSlash, Play, RefreshCw, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'

interface Provider { id: string; label: string; configured: boolean; model: string; baseUrl?: string; active: boolean }
interface Health { id: string; ok: boolean; configured: boolean; model: string; latencyMs?: number; sample?: string; error?: string }

export default function AiHealthPage() {
  const { t } = useTranslation()
  const [me, setMe] = useState<{ isSystemAdmin?: boolean } | null>(null)
  const [data, setData] = useState<{ active: string | null; providers: Provider[] } | null>(null)
  const [health, setHealth] = useState<Record<string, Health>>({})
  const [busy, setBusy] = useState<string | null>(null) // provider id or 'all'

  useEffect(() => { fetch('/api/me').then((r) => r.json()).then(setMe).catch(() => setMe({})) }, [])
  const load = useCallback(() => { fetch('/api/admin/ai-health').then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null)) }, [])
  useEffect(() => { if (me?.isSystemAdmin) load() }, [me, load])

  const test = async (provider?: string) => {
    setBusy(provider ?? 'all')
    try {
      const r = await fetch('/api/admin/ai-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(provider ? { provider } : {}) })
      if (r.ok) {
        const d = await r.json()
        setHealth((prev) => { const next = { ...prev }; for (const h of d.results as Health[]) next[h.id] = h; return next })
      }
    } finally { setBusy(null) }
  }

  if (me && !me.isSystemAdmin) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 text-center sm:px-6">
          <p className="text-sm text-muted-foreground">{t('aihealth.denied')}</p>
          <Link href="/" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft size={15} /> {t('aihealth.back')}</Link>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Activity size={20} className="text-primary" /> {t('aihealth.title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('aihealth.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> {t('aihealth.back')}</Link>
            <Button size="sm" onClick={() => test()} disabled={busy !== null || !data?.providers.some((p) => p.configured)} className="gap-1.5">
              {busy === 'all' ? <Spinner /> : <Play size={14} />} {t('aihealth.testAll')}
            </Button>
          </div>
        </div>

        {!data ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</p>
        ) : (
          <div className="space-y-3">
            {data.active && <p className="text-sm text-muted-foreground">{t('aihealth.activeProvider')}: <span className="font-medium text-foreground">{data.providers.find((p) => p.id === data.active)?.label}</span></p>}
            {!data.providers.some((p) => p.configured) && (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t('aihealth.noneConfigured')}</div>
            )}
            {data.providers.map((p) => {
              const h = health[p.id]
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <StatusDot configured={p.configured} h={h} />
                      <span className="font-medium">{p.label}</span>
                      {p.active && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{t('aihealth.active')}</span>}
                      {!p.configured && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{t('aihealth.notConfigured')}</span>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => test(p.id)} disabled={busy !== null || !p.configured} className="gap-1.5">
                      {busy === p.id ? <Spinner /> : <RefreshCw size={13} />} {t('aihealth.test')}
                    </Button>
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <dt>{t('aihealth.model')}</dt><dd className="font-mono text-foreground/80">{p.model}</dd>
                    {p.baseUrl && (<><dt>{t('aihealth.baseUrl')}</dt><dd className="truncate font-mono text-foreground/80">{p.baseUrl}</dd></>)}
                    {h && h.ok && (<><dt>{t('aihealth.result')}</dt><dd className="text-emerald-600 dark:text-emerald-400">{t('aihealth.ok')} · {h.latencyMs} ms{h.sample ? ` · „${h.sample}"` : ''}</dd></>)}
                    {h && !h.ok && h.configured && (<><dt>{t('aihealth.result')}</dt><dd className="text-rose-600 dark:text-rose-400">{h.error || t('aihealth.failed')}</dd></>)}
                  </dl>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function StatusDot({ configured, h }: { configured: boolean; h?: Health }) {
  if (!configured) return <CircleSlash size={16} className="shrink-0 text-muted-foreground/60" />
  if (!h) return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" title="nieprzetestowany" />
  return h.ok ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" /> : <XCircle size={16} className="shrink-0 text-rose-500" />
}
