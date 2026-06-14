'use client'

import { Network, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'
import { GLYPH, LEGEND_SHAPES, SHAPE_I18N } from './archetypes'
import { DepGraph } from './DepGraph'
import type { RawNode } from './layout'

interface Edge { source: string; target: string }

export function DocGraphDialog({ workspaceId, view, path, onOpen, onClose }: {
  workspaceId: string; view: string; path: string; onOpen: (p: string) => void; onClose: () => void
}) {
  const { t } = useTranslation()
  const [depth, setDepth] = useState(2)
  const [data, setData] = useState<{ nodes: RawNode[]; edges: Edge[]; truncated: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr(false)
    fetch(`/api/ws/${workspaceId}/graph?view=${encodeURIComponent(view)}&path=${encodeURIComponent(path)}&depth=${depth}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) { setData({ nodes: d.nodes ?? [], edges: d.edges ?? [], truncated: Boolean(d.truncated) }); setLoading(false) } })
      .catch(() => { if (!cancelled) { setErr(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [workspaceId, view, path, depth])

  const hasContent = data != null && data.nodes.length > 1
  const navigate = (p: string) => { onOpen(p); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080b12]">
      {/* nagłówek */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-white">
        <Network size={18} className="text-cyan-300" />
        <span className="text-sm font-medium">{t('graph.title')}</span>
        <span className="max-w-[40vw] truncate font-mono text-xs text-white/50">{path}</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-white/60">
            <span>{t('graph.depth')}</span>
            {[1, 2, 3].map((d) => (
              <button key={d} onClick={() => setDepth(d)} aria-label={`${t('graph.depth')} ${d}`}
                className={`h-7 w-7 rounded-md border text-sm transition-colors ${depth === d ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200' : 'border-white/15 text-white/60 hover:bg-white/10'}`}>{d}</button>
            ))}
          </div>
          {loading && data && <Spinner />}
          <button onClick={onClose} aria-label={t('common.close')} className="grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* graf */}
      <div className="relative min-h-0 flex-1">
        {hasContent ? (
          <DepGraph nodes={data!.nodes} edges={data!.edges} centerPath={path} onOpen={navigate} />
        ) : loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-white/70"><Spinner /> {t('common.loading')}</div>
        ) : err ? (
          <div className="flex h-full items-center justify-center text-white/60">{t('graph.error')}</div>
        ) : (
          <div className="flex h-full items-center justify-center text-white/60">{t('graph.empty')}</div>
        )}
      </div>

      {/* legenda: ikona = typ dokumentu, kolor = folder; strzałka = kierunek powiązania */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 px-4 py-2.5 text-[11px] text-white/60">
        {LEGEND_SHAPES.map((a) => (
          <span key={a} className="inline-flex items-center gap-1">
            <span className="text-sm text-white/80">{GLYPH[a]}</span> {t(SHAPE_I18N[a])}
          </span>
        ))}
        <span className="ml-auto text-white/45">{t('graph.colorMeaning')}</span>
        {data?.truncated && <span className="text-amber-300/80">{t('graph.truncated')}</span>}
      </div>
    </div>
  )
}
