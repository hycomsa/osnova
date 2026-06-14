'use client'

import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FileDiff } from '@/lib/git/diff'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'

interface Rev { sha: string; author: string; date: string; message: string }
interface BlameLine { sha: string; author: string; content: string }

export function HistoryDialog({
  workspaceId, view, path, onClose, canRestore = false, onRestored,
}: { workspaceId: string; view: string; path: string; onClose: () => void; canRestore?: boolean; onRestored?: () => void }) {
  const q = `view=${encodeURIComponent(view)}&path=${encodeURIComponent(path)}`
  const { t, i18n } = useTranslation()
  const [revs, setRevs] = useState<Rev[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<Rev | null>(null)
  const [html, setHtml] = useState('')
  const [tab, setTab] = useState<'rev' | 'blame'>('rev')
  const [blameLines, setBlameLines] = useState<BlameLine[] | null>(null)
  const [paneMode, setPaneMode] = useState<'preview' | 'diff'>('preview')
  const [diff, setDiff] = useState<FileDiff | null>(null)
  const [restoring, setRestoring] = useState(false)

  const restore = async (r: Rev) => {
    if (!window.confirm(t('history.restoreConfirm'))) return
    setRestoring(true)
    try {
      const res = await fetch(`/api/ws/${workspaceId}/files?view=${encodeURIComponent(view)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'restore', path, rev: r.sha }),
      })
      if (res.ok) { onRestored?.(); onClose() }
      else setErr(res.status === 403 ? t('history.errPerm') : `HTTP ${res.status}`)
    } catch (e) { setErr(String((e as Error).message)) }
    finally { setRestoring(false) }
  }

  useEffect(() => {
    fetch(`/api/ws/${workspaceId}/history?${q}`)
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 403 ? t('history.errPerm') : `HTTP ${r.status}`); return r.json() })
      .then((d) => setRevs(d.revisions ?? []))
      .catch((e) => setErr(String(e.message)))
  }, [workspaceId, q])

  const openRev = (r: Rev) => {
    setSel(r); setHtml(''); setPaneMode('preview'); setDiff(null)
    fetch(`/api/ws/${workspaceId}/history?${q}&rev=${r.sha}`)
      .then((res) => res.json())
      .then((d) => setHtml(d.html ?? `<pre>${(d.content ?? '').replace(/</g, '&lt;')}</pre>`))
      .catch(() => setHtml('<p>'+t('common.loading')+'</p>'))
  }
  const loadDiff = (r: Rev) => {
    setPaneMode('diff')
    if (diff) return
    fetch(`/api/ws/${workspaceId}/diff?${q}&base=${r.sha}`)
      .then((res) => res.json())
      .then((d) => setDiff({ hunks: d.hunks ?? [], additions: d.additions ?? 0, deletions: d.deletions ?? 0, binary: Boolean(d.binary) }))
      .catch(() => setDiff({ hunks: [], additions: 0, deletions: 0, binary: false }))
  }
  const loadBlame = () => {
    setTab('blame')
    if (blameLines) return
    fetch(`/api/ws/${workspaceId}/blame?${q}`).then((r) => r.json()).then((d) => setBlameLines(d.lines ?? [])).catch(() => setBlameLines([]))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <span className="text-sm font-medium">{t('history.titlePrefix')} — {path}</span>
          <div className="ml-2 inline-flex overflow-hidden rounded-md border border-border text-xs">
            <button className={`px-3 py-1 ${tab === 'rev' ? 'bg-secondary text-primary' : ''}`} onClick={() => setTab('rev')}>{t('history.revisions')}</button>
            <button className={`px-3 py-1 ${tab === 'blame' ? 'bg-secondary text-primary' : ''}`} onClick={loadBlame}>{t('history.blame')}</button>
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>{t('common.close')}</Button>
        </div>

        {err ? (
          <div className="p-6 text-sm text-destructive">{err}</div>
        ) : tab === 'rev' ? (
          <div className="flex flex-1 overflow-hidden">
            <div className="w-72 overflow-auto border-r border-border p-2">
              {revs === null ? <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</p>
                : revs.length === 0 ? <p className="p-2 text-sm text-muted-foreground">{t('history.selectRev')}</p>
                : revs.map((r) => (
                  <button key={r.sha} onClick={() => openRev(r)}
                    className={`mb-1 block w-full rounded p-2 text-left text-xs hover:bg-secondary/60 ${sel?.sha === r.sha ? 'bg-secondary' : ''}`}>
                    <div className="truncate font-medium text-foreground/90">{r.message}</div>
                    <div className="text-muted-foreground">{r.author} · {new Date(r.date).toLocaleString(i18n.language)} · {r.sha.slice(0, 8)}</div>
                  </button>
                ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {!sel ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">{t('history.selectRev')}</div>
              ) : (
                <>
                  <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 text-xs">
                    <button onClick={() => setPaneMode('preview')} className={`rounded px-2 py-1 ${paneMode === 'preview' ? 'bg-secondary text-primary' : 'hover:bg-secondary/60'}`}>{t('history.preview')}</button>
                    <button onClick={() => loadDiff(sel)} className={`rounded px-2 py-1 ${paneMode === 'diff' ? 'bg-secondary text-primary' : 'hover:bg-secondary/60'}`}>{t('history.diff')}</button>
                    {paneMode === 'diff' && diff && !diff.binary && (
                      <span className="tabular-nums">
                        <span className="text-emerald-600 dark:text-emerald-400">+{diff.additions}</span>{' '}
                        <span className="text-rose-600 dark:text-rose-400">−{diff.deletions}</span>
                      </span>
                    )}
                    {canRestore && (
                      <Button size="sm" variant="outline" className="ml-auto h-7 gap-1.5 text-xs"
                        onClick={() => restore(sel)} disabled={restoring} title={t('history.restoreHint')}>
                        {restoring ? <Spinner className="mr-1" /> : <RotateCcw size={13} />} {t('history.restore')}
                      </Button>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    {paneMode === 'preview' ? (
                      <div className="doc-content docs-style-standard" dangerouslySetInnerHTML={{ __html: html }} />
                    ) : diff === null ? (
                      <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Spinner /> {t('history.loadingDiff')}</p>
                    ) : diff.binary ? (
                      <p className="p-3 text-sm text-muted-foreground">{t('history.binary')}</p>
                    ) : diff.hunks.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">{t('history.noDiff')}</p>
                    ) : (
                      <table className="w-full border-collapse font-mono text-xs leading-relaxed">
                        {diff.hunks.map((h, hi) => (
                          <tbody key={hi}>
                            <tr className="bg-secondary/50 text-muted-foreground">
                              <td colSpan={3} className="px-2 py-0.5">@@ {h.header || `hunk ${hi + 1}`}</td>
                            </tr>
                            {h.lines.map((l, li) => (
                              <tr key={li} className={l.type === 'add' ? 'bg-emerald-500/10' : l.type === 'del' ? 'bg-rose-500/10' : ''}>
                                <td className="w-10 select-none px-2 text-right text-muted-foreground/50">{l.oldNo ?? ''}</td>
                                <td className="w-10 select-none px-2 text-right text-muted-foreground/50">{l.newNo ?? ''}</td>
                                <td className="whitespace-pre-wrap px-2">
                                  <span className={`select-none ${l.type === 'add' ? 'text-emerald-600 dark:text-emerald-400' : l.type === 'del' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground/40'}`}>{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '} </span>
                                  {l.text || ' '}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        ))}
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-3">
            {blameLines === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</p>
              : <table className="w-full border-collapse font-mono text-xs">
                  <tbody>
                    {blameLines.map((l, i) => (
                      <tr key={i} className="align-top">
                        <td className="select-none whitespace-nowrap pr-3 text-muted-foreground" title={l.author}>{l.sha} · {l.author.slice(0, 14)}</td>
                        <td className="whitespace-pre-wrap">{l.content || ' '}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
          </div>
        )}
      </div>
    </div>
  )
}
