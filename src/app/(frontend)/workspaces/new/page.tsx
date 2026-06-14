'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, GitBranch, LayoutPanelLeft, Rocket, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'

interface UserRow { id: string | number; email: string; name?: string | null }
const ROLES: { value: string; tkey: string }[] = [
  { value: 'workspace_maintainer', tkey: 'wizard.roleMaintainer' },
  { value: 'editor', tkey: 'wizard.roleEditor' },
  { value: 'client_technical', tkey: 'wizard.roleClientTechnical' },
  { value: 'client_business', tkey: 'wizard.roleClientBusiness' },
  { value: 'viewer', tkey: 'wizard.roleViewer' },
]
const STEPS = [
  { tkey: 'wizard.stepBasics', Icon: LayoutPanelLeft },
  { tkey: 'wizard.stepRepo', Icon: GitBranch },
  { tkey: 'wizard.stepViews', Icon: LayoutPanelLeft },
  { tkey: 'wizard.stepTeam', Icon: Users },
]

async function postJSON(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.error || d?.errors?.[0]?.message || d?.message || `${url}: HTTP ${r.status}`)
  return d
}
const toGlobs = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean).map((glob) => ({ glob }))

export default function NewWorkspacePage() {
  const router = useRouter()
  const { t } = useTranslation()
  const [me, setMe] = useState<{ authenticated: boolean; id?: string | number; isSystemAdmin?: boolean } | null>(null)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [defaultView, setDefaultView] = useState('client_business')
  const [host, setHost] = useState('gitlab')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [credentialRef, setCredentialRef] = useState('')
  const [views, setViews] = useState<Record<string, { enabled: boolean; include: string; hideUnderscored: boolean; showMetadata: boolean }>>({
    client_business: { enabled: true, include: '**', hideUnderscored: true, showMetadata: false },
    client_technical: { enabled: true, include: '**', hideUnderscored: true, showMetadata: false },
  })
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [roleSel, setRoleSel] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetch('/api/me').then((r) => r.json()).then(setMe).catch(() => setMe({ authenticated: false })) }, [])
  useEffect(() => {
    fetch('/api/users?limit=200&depth=0').then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d) => setUsers((d.docs ?? []).map((u: any) => ({ id: u.id, email: u.email, name: u.name }))))
      .catch(() => setUsers([]))
  }, [])
  // domyślnie: dodaj siebie jako Opiekun
  useEffect(() => { if (me?.id != null) setRoleSel((s) => (s[String(me.id)] ? s : { ...s, [String(me.id)]: ['workspace_maintainer'] })) }, [me])

  const toggleRole = (uid: string, role: string) => setRoleSel((s) => {
    const cur = new Set(s[uid] ?? [])
    cur.has(role) ? cur.delete(role) : cur.add(role)
    return { ...s, [uid]: [...cur] }
  })

  const canNext = useMemo(() => {
    if (step === 0) return name.trim().length > 0
    if (step === 1) return repoUrl.trim().length > 0
    return true
  }, [step, name, repoUrl])

  const create = async () => {
    setBusy(true); setError(null)
    try {
      const payload = {
        name: name.trim(),
        defaultView,
        repo: repoUrl.trim() ? { host, repoUrl: repoUrl.trim(), branch: branch.trim() || 'main', credentialRef: credentialRef.trim() || undefined } : null,
        views: (['client_business', 'client_technical'] as const)
          .filter((v) => views[v].enabled)
          .map((v) => ({ view: v, includeGlobs: toGlobs(views[v].include).map((g) => g.glob), hideUnderscored: views[v].hideUnderscored, showMetadata: views[v].showMetadata })),
        members: Object.entries(roleSel).filter(([, roles]) => roles.length).map(([user, roles]) => ({ user, roles })),
      }
      const res = await postJSON('/api/workspaces', payload)
      router.push(`/ws/${res.slug || res.id}`)
    } catch (e) {
      setError(String((e as Error).message))
      setBusy(false)
    }
  }

  if (me && !me.isSystemAdmin) {
    return (
      <div className="flex h-screen flex-col">
        <AppHeader />
        <div className="flex flex-1 items-center justify-center text-muted-foreground">{t('wizard.onlyAdmin')}</div>
      </div>
    )
  }

  const field = 'mb-3'
  const labelCls = 'mb-1 block text-sm font-medium'

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <div className="mx-auto w-full max-w-2xl flex-1 overflow-auto p-6">
        <h1 className="mb-1 text-2xl font-semibold">{t('wizard.title')}</h1>
        <p className="mb-5 text-sm text-muted-foreground">{t('wizard.subtitle')}</p>

        {/* progres */}
        <div className="mb-6 flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.tkey} className="flex flex-1 items-center">
              <div className={`flex items-center gap-2 ${i <= step ? 'text-primary' : 'text-muted-foreground'}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-full border text-xs ${i < step ? 'border-primary bg-primary text-primary-foreground' : i === step ? 'border-primary' : 'border-border'}`}>
                  {i < step ? <Check size={14} /> : i + 1}
                </span>
                <span className="hidden text-sm sm:inline">{t(s.tkey)}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`mx-2 h-px flex-1 ${i < step ? 'bg-primary' : 'bg-border'}`} />}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-5">
          {step === 0 && (
            <div>
              <div className={field}>
                <label className={labelCls}>{t('wizard.name')}</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('wizard.namePlaceholder')} autoFocus />
                <p className="mt-1 text-xs text-muted-foreground">{t('wizard.slugHint')}</p>
              </div>
              <div className={field}>
                <label className={labelCls}>{t('wizard.defaultView')}</label>
                <Select value={defaultView} onChange={(e) => setDefaultView(e.target.value)}>
                  <option value="direct">{t('views.direct')}</option>
                  <option value="client_business">{t('views.client_business')}</option>
                  <option value="client_technical">{t('views.client_technical')}</option>
                </Select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className={field}>
                <label className={labelCls}>{t('wizard.host')}</label>
                <Select value={host} onChange={(e) => setHost(e.target.value)}>
                  <option value="gitlab">GitLab</option>
                  <option value="github">GitHub</option>
                </Select>
              </div>
              <div className={field}>
                <label className={labelCls}>{t('wizard.repoUrl')}</label>
                <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder={t('wizard.repoUrlPlaceholder')} />
              </div>
              <div className="flex gap-3">
                <div className={`${field} flex-1`}>
                  <label className={labelCls}>{t('wizard.branch')}</label>
                  <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
                </div>
                <div className={`${field} flex-1`}>
                  <label className={labelCls}>{t('wizard.token')}</label>
                  <Input value={credentialRef} onChange={(e) => setCredentialRef(e.target.value)} placeholder={t('wizard.tokenPlaceholder')} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('wizard.tokenHint')}</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('wizard.viewsIntro')}</p>
              {(['client_business', 'client_technical'] as const).map((v) => {
                const cfg = views[v]
                const set = (patch: Partial<typeof cfg>) => setViews((s) => ({ ...s, [v]: { ...s[v], ...patch } }))
                return (
                  <div key={v} className="rounded-lg border border-border p-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" checked={cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                      {v === 'client_business' ? t('views.client_business') : t('views.client_technical')}
                    </label>
                    {cfg.enabled && (
                      <div className="mt-2 space-y-2">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">{t('wizard.includeLabel')}</label>
                          <textarea value={cfg.include} onChange={(e) => set({ include: e.target.value })} rows={3}
                            className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs">
                          <label className="flex items-center gap-1.5"><input type="checkbox" checked={cfg.hideUnderscored} onChange={(e) => set({ hideUnderscored: e.target.checked })} /> {t('wizard.hideUnderscored')}</label>
                          <label className="flex items-center gap-1.5"><input type="checkbox" checked={cfg.showMetadata} onChange={(e) => set({ showMetadata: e.target.checked })} /> {t('wizard.showMetadata')}</label>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {step === 3 && (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">{t('wizard.teamIntro')}</p>
              {users === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> {t('wizard.loadingUsers')}</p>
              ) : users.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('wizard.teamEmpty')}</p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-auto">
                  {users.map((u) => (
                    <div key={String(u.id)} className="rounded-lg border border-border p-2.5">
                      <div className="mb-1.5 text-sm">{u.name || u.email} {u.name && <span className="text-xs text-muted-foreground">· {u.email}</span>}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {ROLES.map((r) => {
                          const on = (roleSel[String(u.id)] ?? []).includes(r.value)
                          return (
                            <button key={r.value} onClick={() => toggleRole(String(u.id), r.value)}
                              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary/60'}`}>
                              {t(r.tkey)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="mt-3 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</div>}

        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" onClick={() => (step === 0 ? router.push('/') : setStep((s) => s - 1))} disabled={busy}>
            <ArrowLeft size={15} className="mr-1" /> {step === 0 ? t('common.cancel') : t('common.back')}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>{t('common.next')} <ArrowRight size={15} className="ml-1" /></Button>
          ) : (
            <Button onClick={create} disabled={busy}>
              {busy ? <Spinner className="mr-1.5" /> : <Rocket size={15} className="mr-1.5" />} {t('wizard.create')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
