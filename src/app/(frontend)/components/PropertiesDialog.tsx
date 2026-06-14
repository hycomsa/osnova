'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'

type Row = { key: string; value: string }

// Podgląd i edycja właściwości/metadanych dokumentu (frontmatter) — FR-21.
export function PropertiesDialog(props: {
  workspaceId: string
  view: string
  path: string
  onClose: () => void
  onSaved?: () => void
}) {
  const { workspaceId, view, path, onClose, onSaved } = props
  const { t } = useTranslation()
  const q = `view=${encodeURIComponent(view)}&path=${encodeURIComponent(path)}`
  const [rows, setRows] = useState<Row[] | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/ws/${workspaceId}/properties?${q}`)
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 403 ? t('props.noView') : `HTTP ${r.status}`); return r.json() })
      .then((d) => {
        const meta = d.meta ?? {}
        setRows(Object.entries(meta).map(([key, v]) => ({
          key, value: v != null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
        })))
        setCanEdit(Boolean(d.canEdit))
      })
      .catch((e) => setErr(String(e.message)))
  }, [workspaceId, q])

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const remove = (i: number) => setRows((rs) => rs!.filter((_, idx) => idx !== i))
  const add = () => setRows((rs) => [...(rs ?? []), { key: '', value: '' }])

  const save = async () => {
    if (!rows) return
    setSaving(true); setErr(null)
    const meta: Record<string, string> = {}
    for (const r of rows) if (r.key.trim()) meta[r.key.trim()] = r.value
    try {
      const res = await fetch(`/api/ws/${workspaceId}/properties?view=${encodeURIComponent(view)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, meta }),
      })
      if (res.ok) { onSaved?.(); onClose() }
      else { const d = await res.json().catch(() => ({})); setErr(d.message ?? d.error ?? `HTTP ${res.status}`) }
    } catch (e) { setErr(String((e as Error).message)) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium">{t('props.title')}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">{path}</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>{t('common.close')}</Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {err && <div className="mb-3 rounded bg-destructive/15 px-3 py-2 text-sm text-destructive">{err}</div>}
          {rows === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</p>
          ) : rows.length === 0 && !canEdit ? (
            <p className="text-sm text-muted-foreground">{t('props.empty')}</p>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="w-1/3">{t('props.key')}</span><span className="flex-1">{t('props.value')}</span>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={r.key} disabled={!canEdit} placeholder={t('props.key')}
                    onChange={(e) => update(i, { key: e.target.value })}
                    className="w-1/3 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <input
                    value={r.value} disabled={!canEdit} placeholder={t('props.value')}
                    onChange={(e) => update(i, { value: e.target.value })}
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {canEdit && (
                    <button onClick={() => remove(i)} title={t('common.delete')} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button size="sm" variant="ghost" className="mt-1 gap-1.5 text-xs" onClick={add}>
                  <Plus size={14} /> {t('props.addRow')}
                </Button>
              )}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Spinner className="mr-1" /> : null}{t('props.save')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
