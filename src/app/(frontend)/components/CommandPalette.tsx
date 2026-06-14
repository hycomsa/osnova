'use client'

import { FileText, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@/i18n/client'

interface ContentHit { path: string; snippet?: string }
type Item = { path: string; kind: 'file' | 'content'; snippet?: string }

export function CommandPalette({
  open, files, recent, workspaceId, view, onClose, onOpen,
}: {
  open: boolean
  files: string[]
  recent: string[]
  workspaceId: string
  view: string
  onClose: () => void
  onOpen: (path: string) => void
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [content, setContent] = useState<ContentHit[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) { setQ(''); setIdx(0); setContent([]); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])

  // wyszukiwanie w treści (serwerowe), debounced; dopasowania ścieżek liczymy lokalnie
  useEffect(() => {
    const ql = q.trim()
    if (!open || ql.length < 2) { setContent([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const h = setTimeout(() => {
      fetch(`/api/ws/${workspaceId}/search?view=${encodeURIComponent(view)}&q=${encodeURIComponent(ql)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => { if (!cancelled) setContent((d.results ?? []) as ContentHit[]) })
        .catch(() => { if (!cancelled) setContent([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(h) }
  }, [q, open, workspaceId, view])

  const { fileItems, contentItems, list } = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const fileMatches = (ql
      ? files.filter((p) => p.toLowerCase().includes(ql))
      : recent.filter((p) => files.includes(p))
    ).slice(0, ql ? 25 : 10)
    const fi: Item[] = fileMatches.map((p) => ({ path: p, kind: 'file' }))
    // dopasowania w treści, których nie ma już w dopasowaniach ścieżek
    const seen = new Set(fileMatches)
    const ci: Item[] = content.filter((c) => !seen.has(c.path)).slice(0, 25).map((c) => ({ path: c.path, kind: 'content', snippet: c.snippet }))
    return { fileItems: fi, contentItems: ci, list: [...fi, ...ci] }
  }, [q, files, recent, content])

  // utrzymaj kursor w zakresie listy
  useEffect(() => { setIdx((i) => Math.min(i, Math.max(0, list.length - 1))) }, [list.length])

  if (!open) return null
  const choose = (p: string) => { onOpen(p); onClose() }
  const base = (p: string) => p.split('/').pop()
  const parent = (p: string) => { const i = p.lastIndexOf('/'); return i >= 0 ? p.slice(0, i + 1) : '' }

  let rowCounter = -1
  const renderRow = (it: Item) => {
    rowCounter += 1
    const i = rowCounter
    return (
      <li key={`${it.kind}:${it.path}`}>
        <button
          onMouseEnter={() => setIdx(i)}
          onClick={() => choose(it.path)}
          className={`flex w-full items-start gap-2 rounded px-3 py-1.5 text-left text-sm ${i === idx ? 'bg-secondary text-primary' : 'hover:bg-secondary/50'}`}
        >
          <FileText size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            {/* zawsze pokaż folder nadrzędny — odróżnia identycznie nazwane pliki (np. wiele SKILL.md) */}
            <span className="block truncate">
              <span className="text-muted-foreground">{parent(it.path)}</span>
              <span className="font-medium">{base(it.path)}</span>
            </span>
            {it.snippet && <span className="block truncate text-[11px] text-muted-foreground">{it.snippet}</span>}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter' && list[idx]) { e.preventDefault(); choose(list[idx].path) }
              else if (e.key === 'Escape') onClose()
            }}
            placeholder={t('palette.placeholder')}
            className="w-full bg-transparent py-3 text-sm focus:outline-none"
          />
        </div>
        <ul className="max-h-80 overflow-auto p-1">
          {list.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{q ? (loading ? t('common.loading') : t('palette.noMatches')) : t('palette.noRecent')}</li>
          ) : (
            <>
              {fileItems.length > 0 && <li className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{t('palette.documents')}</li>}
              {fileItems.map(renderRow)}
              {contentItems.length > 0 && <li className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{t('palette.inContent')}{loading ? ' …' : ''}</li>}
              {contentItems.map(renderRow)}
            </>
          )}
        </ul>
      </div>
    </div>
  )
}
