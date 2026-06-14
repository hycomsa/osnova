'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'

interface Skill {
  id: string | number
  key: string
  name: string
  description?: string | null
  category: 'apply' | 'refine'
  instruction: string
  enabled?: boolean | null
  builtin?: boolean | null
}
const VIEWS = ['direct', 'client_business', 'client_technical']
type Draft = { name: string; category: 'apply' | 'refine'; description: string; instruction: string }
const EMPTY: Draft = { name: '', category: 'apply', description: '', instruction: '' }

export default function AiSkillsPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const [view, setView] = useState<string | null>(null)
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editId, setEditId] = useState<string | number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    for (const v of VIEWS) {
      const r = await fetch(`/api/ws/${id}/ai/skills?manage=1&view=${v}`)
      if (r.status === 403) { setForbidden(true); setView(v); setSkills([]); return }
      if (r.ok) { const d = await r.json(); setView(v); setSkills(d.skills ?? []); return }
    }
    setSkills([])
  }, [id])
  useEffect(() => { void load() }, [load])

  const api = async (method: string, body?: any, query = '') => {
    setBusy(true)
    try {
      await fetch(`/api/ws/${id}/ai/skills?view=${view}${query}`, {
        method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
      })
      await load()
    } finally { setBusy(false) }
  }

  const save = async (d: Draft, sid?: string | number) => {
    if (!d.name.trim() || !d.instruction.trim()) return
    if (sid != null) await api('PATCH', { id: sid, ...d })
    else await api('POST', d)
    setDraft(null); setEditId(null)
  }

  const Form = ({ initial, sid }: { initial: Draft; sid?: string | number }) => {
    const [d, setD] = useState<Draft>(initial)
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
        <div className="flex gap-2">
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder={t('aiskills.fName')}
            className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as Draft['category'] })}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="apply">{t('aiskills.catApply')}</option>
            <option value="refine">{t('aiskills.catRefine')}</option>
          </select>
        </div>
        <input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder={t('aiskills.fDesc')}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <textarea value={d.instruction} onChange={(e) => setD({ ...d, instruction: e.target.value })} placeholder={t('aiskills.fInstruction')} rows={3}
          className="w-full resize-y rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setEditId(null) }} disabled={busy}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={() => save(d, sid)} disabled={busy}>{t('aiskills.save')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader workspace={{ id }} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Sparkles size={20} className="text-accent" /> {t('aiskills.title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('aiskills.subtitle')}</p>
          </div>
          <Link href={`/ws/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> {t('members.back')}</Link>
        </div>

        {skills === null ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</p>
        ) : forbidden ? (
          <p className="py-10 text-sm text-muted-foreground">{t('aiskills.forbidden')}</p>
        ) : (
          <div className="space-y-3">
            {skills.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <p className="mb-3">{t('aiskills.empty')}</p>
                <Button size="sm" onClick={() => api('POST', { import: true })} disabled={busy}>{t('aiskills.importDefaults')}</Button>
              </div>
            )}
            {skills.map((s) => (
              <div key={String(s.id)} className="rounded-lg border border-border bg-card/40 p-3">
                {editId === s.id ? (
                  <Form initial={{ name: s.name, category: s.category, description: s.description ?? '', instruction: s.instruction }} sid={s.id} />
                ) : (
                  <div className="flex items-start gap-3">
                    <label className="mt-0.5 inline-flex cursor-pointer items-center" title={t('aiskills.enabled')}>
                      <input type="checkbox" checked={!!s.enabled} onChange={(e) => api('PATCH', { id: s.id, enabled: e.target.checked })} disabled={busy} className="h-4 w-4 accent-primary" />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{t(`aiskills.cat${s.category === 'apply' ? 'Apply' : 'Refine'}`)}</span>
                      </div>
                      {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{s.instruction}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditId(s.id); setDraft(null) }}>{t('aiskills.edit')}</Button>
                      <button onClick={() => { if (confirm(t('aiskills.deleteConfirm'))) api('DELETE', undefined, `&id=${s.id}`) }} title={t('common.delete')} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {draft ? (
              <Form initial={EMPTY} />
            ) : (
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setDraft(EMPTY); setEditId(null) }}><Plus size={15} /> {t('aiskills.addNew')}</Button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
