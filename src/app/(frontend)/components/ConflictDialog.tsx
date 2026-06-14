'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/client'

// Kreator rozwiązywania konfliktu zapisu (FR-19a / US-21): pokazuje obie wersje
// (twoją i zdalną) z podświetleniem różnic i pozwala wybrać jedną lub połączyć je
// ręcznie — bez znajomości Git i bez utraty zmian.
export function ConflictDialog(props: {
  yours: string
  theirs: string
  remoteRevision?: string
  saving?: boolean
  onResolve: (content: string) => void
  onCancel: () => void
}) {
  const { yours, theirs, remoteRevision, saving, onResolve, onCancel } = props
  const { t } = useTranslation()
  const [result, setResult] = useState(yours) // domyślnie zachowaj intencję użytkownika

  // proste oznaczenie linii różniących się między wersjami (multiset linii drugiej strony)
  const diff = useMemo(() => {
    const yLines = yours.split('\n')
    const tLines = theirs.split('\n')
    const count = (arr: string[]) => {
      const m = new Map<string, number>()
      for (const l of arr) m.set(l, (m.get(l) ?? 0) + 1)
      return m
    }
    const tHas = count(tLines)
    const yHas = count(yLines)
    const mark = (lines: string[], other: Map<string, number>) => {
      const seen = new Map<string, number>()
      return lines.map((l) => {
        const used = seen.get(l) ?? 0
        const avail = other.get(l) ?? 0
        seen.set(l, used + 1)
        return { l, changed: used >= avail } // wystąpienia ponad to, co ma druga strona → zmienione
      })
    }
    return { yours: mark(yLines, tHas), theirs: mark(tLines, yHas) }
  }, [yours, theirs])

  const Pane = ({ title, lines, tone, onUse }: {
    title: string; lines: { l: string; changed: boolean }[]; tone: 'mine' | 'remote'; onUse: () => void
  }) => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-1.5">
        <span className="text-xs font-semibold">{title}</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onUse} disabled={saving}>
          {tone === 'mine' ? t('editor.conflict.useYours') : t('editor.conflict.useTheirs')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-background font-mono text-[12px] leading-relaxed">
        {lines.map((row, i) => (
          <div
            key={i}
            className={cn(
              'whitespace-pre-wrap break-words px-3',
              row.changed && (tone === 'mine' ? 'bg-emerald-500/10 border-l-2 border-emerald-500' : 'bg-amber-500/10 border-l-2 border-amber-500'),
            )}
          >
            {row.l || ' '}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    // Brak zamykania kliknięciem w tło — chroni rozpoczęte scalanie przed przypadkowym
    // odrzuceniem; zamknięcie tylko jawnym „Anuluj".
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t('editor.conflict.title')}</span>
            {remoteRevision && (
              <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {t('editor.conflict.remoteAt')} {remoteRevision.slice(0, 8)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('editor.conflict.intro')}</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <div className="flex min-h-0 flex-1 gap-3">
            <Pane title={t('editor.conflict.yours')} lines={diff.yours} tone="mine" onUse={() => setResult(yours)} />
            <Pane title={t('editor.conflict.theirs')} lines={diff.theirs} tone="remote" onUse={() => setResult(theirs)} />
          </div>

          <div className="flex min-h-0 shrink-0 flex-col" style={{ flexBasis: '38%' }}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-semibold">{t('editor.conflict.result')}</span>
              <span className="text-[11px] text-muted-foreground">{t('editor.conflict.resultHint')}</span>
            </div>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none rounded-md border border-input bg-background p-3 font-mono text-[12px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>{t('editor.conflict.cancel')}</Button>
          <Button size="sm" onClick={() => onResolve(result)} disabled={saving}>
            {saving ? <Spinner className="mr-1" /> : null}{t('editor.conflict.saveResolved')}
          </Button>
        </div>
      </div>
    </div>
  )
}
