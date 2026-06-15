'use client'

import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Clock, File, FileCode2, FilePlus, FileText, Folder, FolderOpen, Image as ImageIcon, Layers, Package, Search, Star, Tag } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@/i18n/client'
import { indexNodesByPath, pickRecent, resolveFavorites } from '@/lib/tree'

export interface TreeNode {
  type: 'section' | 'bundle' | 'folder' | 'file'
  id: string
  label: string
  path?: string
  primaryFile?: string
  tabs?: { label: string; path: string }[]
  children?: TreeNode[]
}

function NodeIcon({ node, open }: { node: TreeNode; open: boolean }) {
  const cls = 'shrink-0'
  if (node.type === 'section') return <Layers size={14} className={`${cls} text-muted-foreground`} />
  if (node.type === 'bundle') return <Package size={14} className={`${cls} text-primary/80`} />
  if (node.type === 'folder') return open
    ? <FolderOpen size={14} className={`${cls} text-accent/80`} />
    : <Folder size={14} className={`${cls} text-accent/80`} />
  const p = (node.path ?? node.label).toLowerCase()
  if (/\.(md|markdown)$/.test(p)) return <FileText size={14} className={`${cls} text-muted-foreground`} />
  if (/\.(png|jpe?g|gif|svg|webp)$/.test(p)) return <ImageIcon size={14} className={`${cls} text-muted-foreground`} />
  if (/\.(ya?ml|json|toml|sh|ts|tsx|js|jsx|css)$/.test(p)) return <FileCode2 size={14} className={`${cls} text-muted-foreground`} />
  return <File size={14} className={`${cls} text-muted-foreground`} />
}

function matches(node: TreeNode, q: string): boolean {
  if (!q) return true
  if ((node.label + ' ' + (node.path ?? '')).toLowerCase().includes(q)) return true
  return (node.children ?? []).some((c) => matches(c, q))
}

// gwiazdka ulubionych przy otwieralnym wierszu
function StarToggle({ active, label, onToggle }: { active: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-5 w-5 shrink-0 place-items-center rounded transition-all hover:bg-secondary ${active ? 'text-amber-500 opacity-100' : 'text-muted-foreground/60 opacity-0 group-hover:opacity-100'}`}
    >
      <Star size={13} className={active ? 'fill-amber-400' : ''} />
    </button>
  )
}

// Wiersz drzewa. Świadomie NIE zależy od `active` — podświetlenie aktywnego wiersza
// nakładamy klasą `.row-active` przez efekt DOM, dzięki czemu nawigacja między plikami
// nie przerenderowuje całego drzewa (patrz DocsTree).
type CtxHandler = (e: { preventDefault: () => void; clientX: number; clientY: number }, path: string, label: string) => void

const Row = memo(function Row({
  node, depth, expanded, toggle, onOpen, filter, fav, onToggleFav, addLabel, removeLabel, onContext,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (id: string) => void
  onOpen: (path: string) => void
  filter: string
  fav: Set<string>
  onToggleFav: (path: string, label: string) => void
  addLabel: string
  removeLabel: string
  onContext?: CtxHandler
}) {
  if (!matches(node, filter)) return null
  const hasChildren = (node.children?.length ?? 0) > 0
  const isOpen = expanded.has(node.id) || filter.length > 0
  const favPath = node.type === 'file' ? node.path : node.type === 'bundle' ? node.primaryFile : undefined
  const isFav = favPath != null && fav.has(favPath)

  const handle = () => {
    if (node.type === 'file' && node.path) onOpen(node.path)
    else if (node.type === 'bundle') { if (node.primaryFile) onOpen(node.primaryFile); toggle(node.id) }
    else toggle(node.id)
  }
  // prawy-klik na pliku/bundlu → menu kontekstowe (zmiana nazwy wyświetlanej); cel = ścieżka dokumentu
  const ctxPath = node.type === 'file' ? node.path : node.type === 'bundle' ? node.primaryFile : undefined
  const onCtx = onContext && ctxPath ? (e: { preventDefault: () => void; clientX: number; clientY: number }) => onContext(e, ctxPath, node.label) : undefined

  return (
    <li>
      <div
        data-path={favPath}
        className="docs-row group flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-sm text-foreground/85 transition-colors hover:bg-secondary/60"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handle}
        onContextMenu={onCtx}
        title={node.path ?? node.label}
      >
        <span className="grid w-3.5 shrink-0 place-items-center text-muted-foreground/70">
          {hasChildren ? <ChevronRight size={13} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} /> : null}
        </span>
        <NodeIcon node={node} open={isOpen} />
        <span className={`min-w-0 flex-1 truncate ${node.type === 'section' ? 'text-xs font-semibold uppercase tracking-wide text-muted-foreground' : ''}`}>
          {node.label}
        </span>
        {favPath && <StarToggle active={isFav} label={isFav ? removeLabel : addLabel} onToggle={() => onToggleFav(favPath, node.label)} />}
      </div>
      {hasChildren && isOpen && (
        <ul className="relative">
          {node.children!.map((c) => (
            <Row key={c.id} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} onOpen={onOpen} filter={filter} fav={fav} onToggleFav={onToggleFav} addLabel={addLabel} removeLabel={removeLabel} onContext={onContext} />
          ))}
        </ul>
      )}
    </li>
  )
})

// płaski wiersz dla sekcji „Ulubione" / „Ostatnio otwarte"
const FlatRow = memo(function FlatRow({ entry, onOpen, icon, fav, onToggleFav, addLabel, removeLabel }: {
  entry: { path: string; label: string }
  onOpen: (path: string) => void
  icon: React.ReactNode
  fav: Set<string>
  onToggleFav: (path: string, label: string) => void
  addLabel: string
  removeLabel: string
}) {
  const isFav = fav.has(entry.path)
  return (
    <li>
      <div
        data-path={entry.path}
        className="docs-row group flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 pl-4 text-sm text-foreground/85 transition-colors hover:bg-secondary/60"
        onClick={() => onOpen(entry.path)}
        title={entry.path}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        <StarToggle active={isFav} label={isFav ? removeLabel : addLabel} onToggle={() => onToggleFav(entry.path, entry.label)} />
      </div>
    </li>
  )
})

// stała ikona (referencyjnie stabilna) dla wierszy sekcji ulubione/ostatnie — nie psuje memo FlatRow
const FILE_ICON = <FileText size={14} className="shrink-0 text-muted-foreground" />

// zapamiętana pozycja przewinięcia drzewa per (workspace:widok) — przetrwa remount strony
const TREE_SCROLL = new Map<string, number>()
// cache ulubionych per (workspace:widok) — by sekcja nie migotała po remoncie strony
const FAV_CACHE = new Map<string, { path: string; label?: string | null }[]>()
// cache rozwiniętych gałęzi per storageKey — KLUCZOWE: przy remount strony (nawigacja między
// plikami remountuje komponent) drzewo musi od razu wrócić do poprzedniego stanu rozwinięcia,
// inaczej startuje puste i „zwija się" na chwilę zanim efekt wczyta localStorage.
const EXPANDED_CACHE = new Map<string, Set<string>>()

function collectIds(nodes: TreeNode[]): string[] {
  const ids: string[] = []
  const walk = (list: TreeNode[]) => { for (const n of list) { if (n.children?.length) { ids.push(n.id); walk(n.children) } } }
  walk(nodes)
  return ids
}

export function DocsTree({
  nodes, active, onOpen, storageKey, workspaceId, view, recentPaths = [],
  onNewFile, tags = [], activeTag = null, onToggleTag, canEditProps = false, onChanged,
}: {
  nodes: TreeNode[]
  active: string | null
  onOpen: (path: string) => void
  storageKey: string
  workspaceId?: string
  view?: string
  recentPaths?: string[]
  onNewFile?: () => void
  tags?: { tag: string; count: number }[]
  activeTag?: string | null
  onToggleTag?: (tag: string | null) => void
  canEditProps?: boolean
  onChanged?: () => void
}) {
  // init z cache modułowego → remount strony nie zwija drzewa (pusty start tylko przy 1. wejściu)
  const [expanded, setExpandedState] = useState<Set<string>>(() => EXPANDED_CACHE.get(storageKey) ?? new Set())
  const setExpanded = useCallback((updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setExpandedState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      EXPANDED_CACHE.set(storageKey, next)
      return next
    })
  }, [storageKey])
  const [filter, setFilter] = useState('')
  const [tagsOpen, setTagsOpen] = useState(false)
  const favKey = `${workspaceId ?? ''}:${view ?? ''}`
  const [favs, setFavs] = useState<{ path: string; label?: string | null }[]>(() => FAV_CACHE.get(favKey) ?? [])
  const { t } = useTranslation()

  // Jednorazowe wczytanie stanu rozwinięcia per storageKey: z localStorage, a gdy brak —
  // domyślnie rozwiń sekcje najwyższego poziomu. Gdy cache modułowy już ma stan (remount),
  // nie ruszamy go (useState zainicjalizował z cache). To eliminuje wyścig dwóch efektów,
  // który wcześniej zwijał głębokie gałęzie przy otwieraniu pliku.
  const loadedRef = useRef(false)
  useEffect(() => { loadedRef.current = false }, [storageKey])
  useEffect(() => {
    if (loadedRef.current || !nodes.length) return
    loadedRef.current = true
    if (EXPANDED_CACHE.has(storageKey)) return
    let saved: string[] | null = null
    try {
      const raw = localStorage.getItem(`osnova:tree:${storageKey}`)
      if (raw) saved = JSON.parse(raw)
    } catch { /* ignore */ }
    if (saved && saved.length) setExpanded(new Set(saved))
    else setExpanded(new Set(nodes.filter((n) => n.type === 'section').map((n) => n.id)))
  }, [storageKey, nodes, setExpanded])

  // pobierz ulubione bieżącego widoku
  useEffect(() => {
    if (!workspaceId || !view) return
    let cancelled = false
    fetch(`/api/ws/${workspaceId}/favorites?view=${encodeURIComponent(view)}`)
      .then((r) => (r.ok ? r.json() : { favorites: [] }))
      .then((d) => { if (!cancelled) { const f = d.favorites ?? []; FAV_CACHE.set(favKey, f); setFavs(f) } })
      .catch(() => { if (!cancelled) setFavs([]) })
    return () => { cancelled = true }
  }, [workspaceId, view])

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem(`osnova:tree:${storageKey}`, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [storageKey])
  const setAllExpanded = (open: boolean) => {
    const next = open ? new Set(collectIds(nodes)) : new Set<string>()
    setExpanded(next)
    try { localStorage.setItem(`osnova:tree:${storageKey}`, JSON.stringify([...next])) } catch { /* ignore */ }
  }

  const favSet = useMemo(() => new Set(favs.map((f) => f.path)), [favs])
  const toggleFav = useCallback((path: string, label: string) => {
    if (!workspaceId || !view) return
    const isFav = favSet.has(path)
    // optymistycznie (aktualizuj też cache, by sekcja nie wracała do starego stanu po remoncie)
    setFavs((prev) => { const next = isFav ? prev.filter((f) => f.path !== path) : [{ path, label }, ...prev]; FAV_CACHE.set(favKey, next); return next })
    const url = `/api/ws/${workspaceId}/favorites?view=${encodeURIComponent(view)}${isFav ? `&path=${encodeURIComponent(path)}` : ''}`
    fetch(url, isFav
      ? { method: 'DELETE' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, label }) },
    ).catch(() => { /* przy błędzie zostaw stan optymistyczny */ })
  }, [workspaceId, view, favSet])

  // menu kontekstowe drzewa: szybka zmiana nazwy wyświetlanej (frontmatter `name`)
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; label: string } | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('click', close); document.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [menu])
  const onContext = useMemo<CtxHandler | undefined>(() => (canEditProps && workspaceId && view)
    ? (e, path, label) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, path, label }) }
    : undefined, [canEditProps, workspaceId, view])
  const renameDisplay = useCallback(async (path: string, currentLabel: string) => {
    if (!workspaceId || !view) return
    const raw = window.prompt(t('viewer.renameDisplayPrompt'), currentLabel)
    if (raw === null) return // anulowano
    await fetch(`/api/ws/${workspaceId}/properties?view=${encodeURIComponent(view)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, name: raw.trim() }),
    }).catch(() => {})
    onChanged?.()
  }, [workspaceId, view, onChanged, t])

  const index = useMemo(() => indexNodesByPath(nodes as any), [nodes])
  const favEntries = useMemo(() => resolveFavorites(favs, index), [favs, index])
  const recentEntries = useMemo(() => pickRecent(recentPaths, index, 6), [recentPaths, index])

  const q = filter.trim().toLowerCase()
  const empty = nodes.length === 0
  const addLabel = t('viewer.addFavorite')
  const removeLabel = t('viewer.removeFavorite')

  // Podświetlenie aktywnego wiersza nakładamy klasą w DOM (nie przez re-render drzewa),
  // dzięki czemu otwieranie kolejnych plików nie przerenderowuje całego drzewa.
  const treeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const root = treeRef.current
    if (!root) return
    root.querySelectorAll('.docs-row.row-active').forEach((el) => el.classList.remove('row-active'))
    if (!active) return
    // wartość atrybutu w cudzysłowie — escapujemy tylko \ oraz "
    const esc = active.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    root.querySelectorAll(`.docs-row[data-path="${esc}"]`).forEach((el) => el.classList.add('row-active'))
  }, [active, nodes, favEntries, recentEntries, q, expanded])

  // Przywróć pozycję przewinięcia drzewa po remoncie strony — jednorazowo, gdy treść
  // jest już dość wysoka (po przywróceniu rozwiniętych gałęzi). Reaguje na zmianę `expanded`.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    const root = treeRef.current
    const s = TREE_SCROLL.get(storageKey)
    if (root && s && s > 0 && root.scrollHeight > root.clientHeight) {
      root.scrollTop = s
      restoredRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, expanded, nodes, favEntries, recentEntries])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* filtr na własnym, pełnej szerokości wierszu; akcje w osobnym rzędzie poniżej */}
      <div className="mb-2 space-y-1.5">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('viewer.filterTree')}
            aria-label={t('viewer.filterTree')}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-center justify-end gap-1">
          {tags.length > 0 && (
            <button onClick={() => setTagsOpen((o) => !o)} title={t('viewer.tags')} aria-label={t('viewer.tags')} aria-pressed={tagsOpen || !!activeTag}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-secondary hover:text-foreground ${tagsOpen || activeTag ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}>
              <Tag size={14} />
            </button>
          )}
          <button onClick={() => setAllExpanded(true)} title={t('viewer.expandAll')} aria-label={t('viewer.expandAll')} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
            <ChevronsUpDown size={14} />
          </button>
          <button onClick={() => setAllExpanded(false)} title={t('viewer.collapseAll')} aria-label={t('viewer.collapseAll')} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
            <ChevronsDownUp size={14} />
          </button>
          {onNewFile && (
            <button onClick={onNewFile} title={t('viewer.newFile')} aria-label={t('viewer.newFile')} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
              <FilePlus size={14} />
            </button>
          )}
        </div>
      </div>

      {tagsOpen && tags.length > 0 && (
        <div className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-auto rounded-md border border-border/60 bg-background/40 p-1.5">
          {tags.slice(0, 40).map((tg) => (
            <button key={tg.tag} onClick={() => onToggleTag?.(activeTag === tg.tag ? null : tg.tag)}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${activeTag === tg.tag ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-secondary/60'}`}>
              {tg.tag} <span className="opacity-60">{tg.count}</span>
            </button>
          ))}
        </div>
      )}

      <div ref={treeRef} onScroll={(e) => { const st = e.currentTarget.scrollTop; if (st > 0) TREE_SCROLL.set(storageKey, st) }} className="min-h-0 flex-1 overflow-auto">
        {/* Ulubione */}
        {!q && favEntries.length > 0 && (
          <section className="mb-2">
            <h3 className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Star size={12} className="fill-amber-400 text-amber-500" /> {t('viewer.favorites')}
            </h3>
            <ul>
              {favEntries.map((e) => (
                <FlatRow key={`fav:${e.path}`} entry={e} onOpen={onOpen} icon={FILE_ICON}
                  fav={favSet} onToggleFav={toggleFav} addLabel={addLabel} removeLabel={removeLabel} />
              ))}
            </ul>
          </section>
        )}

        {/* Dokumenty (Ostatnio otwarte przeniesione do przyklejonej stopki — patrz niżej) */}
        {empty ? (
          <p className="px-2 text-xs text-muted-foreground">{t('viewer.emptyTree')}</p>
        ) : (
          <section>
            {!q && favEntries.length > 0 && (
              <h3 className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('viewer.documents')}</h3>
            )}
            <ul>
              {nodes.map((n) => (
                <Row key={n.id} node={n} depth={0} expanded={expanded} toggle={toggle} onOpen={onOpen} filter={q} fav={favSet} onToggleFav={toggleFav} addLabel={addLabel} removeLabel={removeLabel} onContext={onContext} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Ostatnio otwarte — przyklejone do dołu eksploratora; nie przesuwa drzewa przy klikaniu */}
      {!q && recentEntries.length > 0 && (
        <div className="shrink-0 border-t border-border/60 pt-1.5">
          <h3 className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock size={12} /> {t('viewer.recent')}
          </h3>
          <ul className="max-h-40 overflow-auto">
            {recentEntries.map((e) => (
              <FlatRow key={`rec:${e.path}`} entry={e} onOpen={onOpen} icon={FILE_ICON}
                fav={favSet} onToggleFav={toggleFav} addLabel={addLabel} removeLabel={removeLabel} />
            ))}
          </ul>
        </div>
      )}

      {menu && (
        <div className="fixed z-50 min-w-[13rem] overflow-hidden rounded-lg border border-border bg-popover/95 p-1 text-sm shadow-xl backdrop-blur"
          style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { const m = menu; setMenu(null); void renameDisplay(m.path, m.label) }}
            className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-secondary/70">{t('viewer.renameDisplay')}</button>
        </div>
      )}
    </div>
  )
}
