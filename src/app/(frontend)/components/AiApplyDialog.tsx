'use client'

import { Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/client'

// „Wciel komentarze (AI)": pobiera propozycję AI dla ZAAKCEPTOWANYCH komentarzy, pokazuje
// obecną treść vs propozycję (z podświetleniem różnic) i pozwala zapisać (commit+push).
export function AiApplyDialog({ workspaceId, view, path, currentContent, onClose, onSaved }: {
  workspaceId: string; view: string; path: string; currentContent: string
  onClose: () => void; onSaved: () => void
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [errKey, setErrKey] = useState<string | null>(null)
  const [proposal, setProposal] = useState('')
  const [result, setResult] = useState('')
  const [appliedIds, setAppliedIds] = useState<(string | number)[]>([])
  const [count, setCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [skills, setSkills] = useState<{ key: string; name: string; description?: string; category: string }[]>([])
  const [skillKey, setSkillKey] = useState<string | null>(null)

  // pobierz gotowe skille (tryby); domyślnie pierwszy
  useEffect(() => {
    fetch(`/api/ws/${workspaceId}/ai/skills?view=${encodeURIComponent(view)}`)
      .then((r) => (r.ok ? r.json() : { skills: [] }))
      .then((d) => { const s = d.skills ?? []; setSkills(s); setSkillKey((k) => k ?? (s[0]?.key ?? '')) })
      .catch(() => setSkillKey(''))
  }, [workspaceId, view])

  // wygeneruj propozycję dla wybranego skilla (ponów przy zmianie skilla)
  useEffect(() => {
    if (skillKey === null) return // czekamy na załadowanie listy skilli
    let cancelled = false
    setLoading(true); setErrKey(null)
    fetch(`/api/ws/${workspaceId}/ai/apply-comments?view=${encodeURIComponent(view)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, skillKey: skillKey || undefined }),
    }).then(async (r) => {
      const d = await r.json().catch(() => ({}))
      if (cancelled) return
      if (r.ok) { setProposal(d.proposal ?? ''); setResult(d.proposal ?? ''); setAppliedIds(d.appliedIds ?? []); setCount(d.appliedCount ?? 0) }
      else setErrKey(r.status === 501 ? 'unconfigured' : r.status === 403 ? 'forbidden' : d.error === 'no-accepted-comments' ? 'none' : 'error')
      setLoading(false)
    }).catch(() => { if (!cancelled) { setErrKey('error'); setLoading(false) } })
    return () => { cancelled = true }
  }, [workspaceId, view, path, skillKey])

  // proste oznaczenie linii różniących się (multiset linii drugiej strony)
  const diff = useMemo(() => {
    const yL = currentContent.split('\n'), tL = proposal.split('\n')
    const count = (a: string[]) => { const m = new Map<string, number>(); for (const l of a) m.set(l, (m.get(l) ?? 0) + 1); return m }
    const mark = (lines: string[], other: Map<string, number>) => {
      const seen = new Map<string, number>()
      return lines.map((l) => { const used = seen.get(l) ?? 0; seen.set(l, used + 1); return { l, changed: used >= (other.get(l) ?? 0) } })
    }
    return { cur: mark(yL, count(tL)), prop: mark(tL, count(yL)) }
  }, [currentContent, proposal])

  const save = async () => {
    setSaving(true); setSaveErr(null)
    try {
      const res = await fetch(`/api/ws/${workspaceId}/file?view=${encodeURIComponent(view)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content: result }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSaveErr(res.status === 409 ? t('ai.conflict') : d.message ?? d.error ?? `HTTP ${res.status}`)
        setSaving(false); return
      }
      // oznacz wcielone komentarze jako rozwiązane (best-effort)
      await Promise.all(appliedIds.map((id) =>
        fetch(`/api/ws/${workspaceId}/comments?view=${encodeURIComponent(view)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'resolved' }),
        }).catch(() => {})))
      onSaved(); onClose()
    } catch (e) { setSaveErr(String((e as Error).message)); setSaving(false) }
  }

  const Pane = ({ title, lines, tone }: { title: string; lines: { l: string; changed: boolean }[]; tone: 'cur' | 'prop' }) => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-border">
      <div className="border-b border-border bg-secondary/40 px-3 py-1.5 text-xs font-semibold">{title}</div>
      <div className="min-h-0 flex-1 overflow-auto bg-background font-mono text-[12px] leading-relaxed">
        {lines.map((row, i) => (
          <div key={i} className={cn('whitespace-pre-wrap break-words px-3', row.changed && (tone === 'prop' ? 'border-l-2 border-emerald-500 bg-emerald-500/10' : 'border-l-2 border-rose-500 bg-rose-500/10'))}>{row.l || ' '}</div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles size={18} className="text-accent" />
          <span className="text-sm font-medium">{t('ai.title')}</span>
          {skills.length > 0 && (
            <select
              value={skillKey ?? ''}
              onChange={(e) => setSkillKey(e.target.value)}
              disabled={saving}
              title={skills.find((s) => s.key === skillKey)?.description}
              aria-label={t('ai.skill')}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {skills.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          )}
          {!loading && !errKey && <span className="text-xs text-muted-foreground">· {t('ai.applied', { count })}</span>}
          <button onClick={onClose} aria-label={t('common.close')} className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Spinner /> {t('ai.analyzing')}</div>
        ) : errKey ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">{t(`ai.${errKey}`)}</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            {saveErr && <div className="rounded bg-destructive/15 px-3 py-2 text-sm text-destructive">{saveErr}</div>}
            <div className="flex min-h-0 flex-1 gap-3">
              <Pane title={t('ai.current')} lines={diff.cur} tone="cur" />
              <Pane title={t('ai.proposal')} lines={diff.prop} tone="prop" />
            </div>
            <div className="flex min-h-0 shrink-0 flex-col" style={{ flexBasis: '34%' }}>
              <span className="mb-1 text-xs font-semibold">{t('ai.result')}</span>
              <textarea value={result} onChange={(e) => setResult(e.target.value)} spellCheck={false}
                className="min-h-0 flex-1 resize-none rounded-md border border-input bg-background p-3 font-mono text-[12px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>
        )}

        {!loading && !errKey && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? <Spinner className="mr-1" /> : null}{t('ai.save')}</Button>
          </div>
        )}
      </div>
    </div>
  )
}
