'use client'

import { type MouseEvent as ReactMouseEvent, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BarChart3, Check, ChevronDown, ChevronUp, ClipboardCopy, Copy, Edit3, FileQuestion, History as HistoryIcon, Link2, Lock, Menu, MessageSquare, MoreHorizontal, Network, Palette, PanelLeftClose, PanelLeftOpen, Printer, SlidersHorizontal, Sparkles, TriangleAlert, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { MermaidHydrator } from '@/app/(frontend)/components/MermaidHydrator'
import { DocEditor } from '@/app/(frontend)/components/DocEditor'
import { CommentsPanel } from '@/app/(frontend)/components/CommentsPanel'
import { HistoryDialog } from '@/app/(frontend)/components/HistoryDialog'
import { PropertiesDialog } from '@/app/(frontend)/components/PropertiesDialog'
import { AiApplyDialog } from '@/app/(frontend)/components/AiApplyDialog'
import { Avatar } from '@/components/ui/avatar'

// Wizualizacja orbitalna (three.js/WebGL) — ładowana leniwie, by nie obciążać głównego bundla.
const DocGraphDialog = dynamic(() => import('@/app/(frontend)/components/doc-graph/DocGraphDialog').then((m) => m.DocGraphDialog), { ssr: false })
import { CommandPalette } from '@/app/(frontend)/components/CommandPalette'
import { DocsTree, type TreeNode } from '@/app/(frontend)/components/DocsTree'
import { ApprovalControl } from '@/app/(frontend)/components/ApprovalControl'
import { useTranslation } from '@/i18n/client'
import { cn } from '@/lib/utils'

const THEMES = ['standard', 'full', 'reading', 'editorial', 'pastel', 'technical', 'terminal', 'neon'] as const
const THEME_META: Record<(typeof THEMES)[number], { label: string; hint: string }> = {
  standard: { label: 'Czysty', hint: 'neutralny, sans' },
  full: { label: 'Pełna szerokość', hint: 'cała szerokość, szerokie tabele' },
  reading: { label: 'Lektura', hint: 'serif, sepia, wąska kolumna' },
  editorial: { label: 'Redakcyjny', hint: 'magazyn, duże nagłówki' },
  pastel: { label: 'Pastel', hint: 'miękki, kolorowy' },
  technical: { label: 'Techniczny', hint: 'gęsty, szeroki, mono' },
  terminal: { label: 'Terminal', hint: 'ciemny, zielony mono' },
  neon: { label: 'Neon', hint: 'ciemny, neon' },
}
const DOCSTYLE_KEY = 'osnova:docstyle'
// podgląd stylu (kolory + realne czcionki — zgodne z docs-themes.css)
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif'
interface StylePreview { bg: string; fg: string; heading: string; accent: string; headingFont: string; bodyFont: string }
const STYLE_SWATCH: Record<(typeof THEMES)[number], StylePreview> = {
  standard: { bg: '#ffffff', fg: '#1f2328', heading: '#0d1117', accent: '#0969da', headingFont: SANS, bodyFont: SANS },
  full: { bg: '#ffffff', fg: '#1f2937', heading: '#0f172a', accent: '#4f46e5', headingFont: '"Inter", system-ui, sans-serif', bodyFont: '"Inter", system-ui, sans-serif' },
  reading: { bg: '#faf4e8', fg: '#43372a', heading: '#2d241a', accent: '#b06a33', headingFont: SERIF, bodyFont: SERIF },
  editorial: { bg: '#fbfbf9', fg: '#1a1a1a', heading: '#111111', accent: '#b3261e', headingFont: '"Helvetica Neue", Helvetica, Arial, sans-serif', bodyFont: '"Charter", Georgia, serif' },
  pastel: { bg: '#fdf4fb', fg: '#4f4258', heading: '#7c3aed', accent: '#c026d3', headingFont: '"Quicksand", "Nunito", sans-serif', bodyFont: '"Quicksand", "Nunito", sans-serif' },
  technical: { bg: '#f4f6f8', fg: '#1f2937', heading: '#0f172a', accent: '#0e7490', headingFont: MONO, bodyFont: '"Inter", system-ui, sans-serif' },
  terminal: { bg: '#0b0f0c', fg: '#4ade80', heading: '#86efac', accent: '#22c55e', headingFont: MONO, bodyFont: MONO },
  neon: { bg: '#08081a', fg: '#b8eaff', heading: '#ff5bd8', accent: '#00e5ff', headingFont: MONO, bodyFont: MONO },
}

// miniatura stylu — pasek głównych kolorów (nagłówek / akcent / tekst) + podgląd „Aa" na tle stylu
function StyleSwatch({ s }: { s: (typeof THEMES)[number] }) {
  const c = STYLE_SWATCH[s]
  return (
    <span
      className="flex h-[52px] w-[72px] shrink-0 flex-col overflow-hidden rounded-md border border-black/10 shadow-sm"
      aria-hidden
    >
      {/* kafelki głównych kolorów stylu */}
      <span className="flex h-3.5 w-full">
        <span className="h-full flex-1" style={{ background: c.heading }} />
        <span className="h-full flex-1" style={{ background: c.accent }} />
        <span className="h-full flex-1" style={{ background: c.fg }} />
      </span>
      {/* podgląd typografii na tle stylu */}
      <span className="flex flex-1 flex-col justify-center gap-[2px] px-2" style={{ background: c.bg, fontFamily: c.bodyFont }}>
        <span style={{ color: c.heading, fontFamily: c.headingFont, fontWeight: 700, fontSize: 13, lineHeight: 1 }}>Aa</span>
        <span style={{ color: c.accent, fontSize: 7, lineHeight: 1 }}>odnośnik</span>
      </span>
    </span>
  )
}
const VIEW_LABEL: Record<string, string> = {
  direct: 'Bezpośredni (1:1)',
  client_business: 'Kliencki — biznesowy',
  client_technical: 'Kliencki — techniczny',
}
const ALL_VIEWS = Object.keys(VIEW_LABEL)
const isMd = (p: string) => /\.(md|markdown)$/i.test(p)

interface TreeResponse {
  view: string
  allowedViews: string[]
  files: string[]
  nodes?: TreeNode[]
  canManage?: boolean
  canManageMembers?: boolean
  canUseAI?: boolean
  canViewReports?: boolean
  canEditProps?: boolean
  revision?: string | null
  workspaceName?: string
  workspaceSlug?: string
}

// Cache drzewa per (workspace, widok). App Router remontuje stronę przy zmianie ścieżki
// w URL; cache + leniwa inicjalizacja stanu sprawiają, że po remoncie drzewo maluje się
// natychmiast z pamięci (bez ponownego pobrania i migotania). Świeżość zapewnia rewalidacja
// w tle (efekt init) oraz polling rewizji.
const TREE_CACHE = new Map<string, TreeResponse>()
const treeKey = (id: string, view: string | null | undefined) => `${id}:${view ?? ''}`

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Ładowanie…</div>}>
      <WorkspaceView />
    </Suspense>
  )
}

function WorkspaceView() {
  const routeParams = useParams<{ id: string; path?: string[] }>()
  const id = routeParams.id
  const urlPath = useMemo(
    () => (Array.isArray(routeParams.path) ? routeParams.path : []).join('/'),
    [routeParams.path],
  )
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlView = searchParams.get('view')
  const { t } = useTranslation()
  const viewLabel = (v: string) => t(`views.${v}`)

  // leniwa inicjalizacja z cache → po remoncie strony drzewo jest od razu widoczne
  const cachedTree = urlView ? TREE_CACHE.get(treeKey(id, urlView)) ?? null : null
  const [view, setView] = useState<string | null>(cachedTree?.view ?? null)
  const [tree, setTree] = useState<TreeResponse | null>(cachedTree)
  const [error, setError] = useState<string | null>(null)
  const [html, setHtml] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [activeTabs, setActiveTabs] = useState<{ label: string; path: string }[] | null>(null)
  const [theme, setThemeState] = useState<(typeof THEMES)[number]>('editorial')
  const setTheme = useCallback((t: (typeof THEMES)[number]) => {
    setThemeState(t)
    try { localStorage.setItem(DOCSTYLE_KEY, t) } catch { /* ignore */ }
  }, [])
  const [raw, setRaw] = useState<string | null>(null)
  const [openError, setOpenError] = useState<number | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showComments, setShowComments] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [showProps, setShowProps] = useState(false)
  const [showGraph, setShowGraph] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [presence, setPresence] = useState<{ userId: string; name?: string | null; email?: string | null; activity: string }[]>([])
  const [ribbonExpanded, setRibbonExpanded] = useState(true) // pasek narzędzi: ribbon (etykiety) vs zwinięty (ikony)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([])
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // mobile: tree i komentarze działają jako wysuwane szuflady (drawer), nie kolumny
  const [isMobile, setIsMobile] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [mobileComments, setMobileComments] = useState(false)
  const [fileMenu, setFileMenu] = useState(false)
  const [stylePop, setStylePop] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [docStale, setDocStale] = useState(false)
  const revRef = useRef<string | null>(cachedTree?.revision ?? null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const loadedKey = useRef<string | null>(null)
  const styleRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!stylePop && !fileMenu) return
    const onDoc = (e: MouseEvent) => {
      if (styleRef.current && !styleRef.current.contains(e.target as Node)) setStylePop(false)
      if (fileRef.current && !fileRef.current.contains(e.target as Node)) setFileMenu(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [stylePop, fileMenu])

  const canManage = Boolean(tree?.canManage)

  // ── URL helpers ──────────────────────────────────────────────────────────
  const hrefFor = useCallback(
    (p: string, v: string | null) => {
      const base = p ? `/ws/${id}/${p.split('/').map(encodeURIComponent).join('/')}` : `/ws/${id}`
      return v ? `${base}?view=${encodeURIComponent(v)}` : base
    },
    [id],
  )
  // nawigacja do pliku — zapisuje pełny URL w przeglądarce (do udostępniania)
  const go = useCallback(
    (p: string) => router.push(hrefFor(p, view), { scroll: false }),
    [router, hrefFor, view],
  )
  const goView = useCallback(
    (v: string) => router.push(hrefFor(urlPath, v), { scroll: false }),
    [router, hrefFor, urlPath],
  )

  // ── Ustal aktywny widok + załaduj drzewo (honoruje ?view= z URL) ──────────
  const loadTreeForView = useCallback(
    async (v: string): Promise<TreeResponse | null> => {
      const r = await fetch(`/api/ws/${id}/tree?view=${encodeURIComponent(v)}`)
      if (!r.ok) return null
      return (await r.json()) as TreeResponse
    },
    [id],
  )

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      setError(null)
      const prefer = urlView && ALL_VIEWS.includes(urlView) ? urlView : null
      const candidates = [...new Set([...(prefer ? [prefer] : []), 'client_business', 'client_technical', 'direct'])]
      for (const v of candidates) {
        const d = await loadTreeForView(v)
        if (cancelled) return
        if (d) {
          TREE_CACHE.set(treeKey(id, d.view), d)
          setView(d.view)
          // rewalidacja w tle: jeśli rewizja bez zmian, nie przerenderowuj drzewa
          if (revRef.current && d.revision && d.revision === revRef.current) {
            if (urlView !== d.view) router.replace(hrefFor(urlPath, d.view), { scroll: false })
            return
          }
          setTree(d)
          setActiveTag(null)
          revRef.current = d.revision ?? null
          // zapewnij ?view= w URL, by link był jednoznaczny i współdzielony
          if (urlView !== d.view) router.replace(hrefFor(urlPath, d.view), { scroll: false })
          return
        }
      }
      if (!cancelled) setError(t('viewer.noAccessView'))
    }
    void init()
    return () => { cancelled = true }
    // celowo zależne tylko od id + urlView (zmiana widoku w URL przeładowuje drzewo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, urlView])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DOCSTYLE_KEY)
      if (saved && (THEMES as readonly string[]).includes(saved)) setThemeState(saved as (typeof THEMES)[number])
      const w = Number(localStorage.getItem('osnova:sidebarWidth'))
      if (w >= 220 && w <= 520) setSidebarWidth(w)
      setSidebarCollapsed(localStorage.getItem('osnova:sidebarCollapsed') === '1')
      setRibbonExpanded(localStorage.getItem('osnova:ribbon') !== '0')
    } catch { /* ignore */ }
  }, [])
  const toggleRibbon = useCallback(() => {
    setRibbonExpanded((v) => { const n = !v; try { localStorage.setItem('osnova:ribbon', n ? '1' : '0') } catch {} return n })
  }, [])

  // śledź breakpoint mobilny (Tailwind md = 768px)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const on = () => { setIsMobile(mq.matches); if (!mq.matches) { setMobileNav(false); setMobileComments(false) } }
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // Obecność: heartbeat „kto ogląda ten dokument" co ~10 s; lista innych z odpowiedzi.
  useEffect(() => {
    if (!active || !view) { setPresence([]); return }
    let stopped = false
    const beat = async () => {
      try {
        const r = await fetch(`/api/ws/${id}/presence`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: active, activity: editing ? 'editing' : 'viewing' }),
        })
        if (r.ok && !stopped) { const d = await r.json(); setPresence(d.users ?? []) }
      } catch { /* ignore */ }
    }
    void beat()
    const iv = window.setInterval(beat, 10000)
    return () => {
      stopped = true; window.clearInterval(iv)
      void fetch(`/api/ws/${id}/presence?path=${encodeURIComponent(active)}`, { method: 'DELETE' }).catch(() => {})
    }
  }, [id, active, view, editing])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => { const n = !c; try { localStorage.setItem('osnova:sidebarCollapsed', n ? '1' : '0') } catch {} return n })
  }, [])
  // przycisk panelu: na mobile otwiera/zamyka szufladę drzewa, na desktopie zwija kolumnę
  const onToggleNav = useCallback(() => { if (isMobile) setMobileNav((v) => !v); else toggleSidebar() }, [isMobile, toggleSidebar])
  const onToggleComments = useCallback(() => { if (isMobile) setMobileComments((v) => !v); else setShowComments((s) => !s) }, [isMobile])
  // przeciąganie krawędzi panelu (zmiana szerokości)
  const startResize = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(520, Math.max(220, startW + (ev.clientX - startX)))
      setSidebarWidth(w)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setSidebarWidth((w) => { try { localStorage.setItem('osnova:sidebarWidth', String(w)) } catch {} return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(`osnova:recent:${id}`) || '[]')) } catch { setRecent([]) }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])

  useEffect(() => {
    if (!view) return
    fetch(`/api/ws/${id}/tags?view=${encodeURIComponent(view)}`)
      .then((r) => (r.ok ? r.json() : { tags: [] })).then((d) => setTags(d.tags ?? [])).catch(() => setTags([]))
  }, [id, view])

  // taby bundla dla danej ścieżki (z węzłów drzewa)
  const findTabs = useCallback((path: string): { label: string; path: string }[] | null => {
    const walk = (nodes: TreeNode[]): { label: string; path: string }[] | null => {
      for (const n of nodes) {
        if (n.type === 'bundle' && (n.primaryFile === path || n.children?.some((c) => c.path === path))) return n.tabs ?? null
        const r = n.children ? walk(n.children) : null
        if (r) return r
      }
      return null
    }
    return tree?.nodes ? walk(tree.nodes) : null
  }, [tree])

  const openFile = useCallback(async (path: string) => {
    if (!view) return
    setActive(path); setActiveTabs(findTabs(path)); setEditing(false); setRaw(null); setCanEdit(false); setFileMenu(false); setOpenError(null); setDocStale(false)
    setRecent((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, 12)
      try { localStorage.setItem(`osnova:recent:${id}`, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    const b = `/api/ws/${id}/file?view=${encodeURIComponent(view)}&path=${encodeURIComponent(path)}`
    try {
      const r = await fetch(b)
      if (!r.ok) { setHtml(''); setOpenError(r.status); return }
      const ct = r.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) setHtml((await r.json()).html ?? '')
      else { setHtml(`<p class="text-muted-foreground">${t('viewer.binaryFile')}: <a class="text-primary underline" href="${r.url}" target="_blank" rel="noreferrer">${t('viewer.openInTab')}</a></p>`); return }
      if (isMd(path)) {
        const rr = await fetch(`${b}&format=raw`)
        if (rr.ok) { const d = await rr.json(); setRaw(d.content ?? ''); setCanEdit(Boolean(d.canEdit)) }
      }
    } catch { setHtml(''); setOpenError(0) }
  }, [id, view, findTabs])

  // ── Otwórz dokument wskazany w URL (deep-link / nawigacja) ────────────────
  useEffect(() => {
    if (!view || !tree) return
    if (!urlPath) { loadedKey.current = null; setActive(null); setActiveTabs(null); setHtml(''); setRaw(null); return }
    const key = `${view}|${urlPath}`
    if (loadedKey.current === key) return
    loadedKey.current = key
    void openFile(urlPath)
  }, [urlPath, view, tree, openFile])

  const flashToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 1800)
  }, [])

  // ── Przewiń do kotwicy (#nagłówek) po wyrenderowaniu treści ────────────────
  useEffect(() => {
    if (!html) return
    const t = setTimeout(() => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''))
      if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }, 120)
    return () => clearTimeout(t)
  }, [html])

  // klik w nagłówek (delegacja zdarzeń) → kopiuj współdzielony link do sekcji
  const onContentClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]') as HTMLElement | null
    if (!el || !contentRef.current?.contains(el)) return
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${el.id}`
    window.history.replaceState(null, '', `#${el.id}`)
    void navigator.clipboard?.writeText(url)
    flashToast(t('viewer.copiedSection'))
  }, [flashToast])

  const reloadTree = useCallback(async () => {
    if (!view) return
    const d = await loadTreeForView(view)
    if (d) { TREE_CACHE.set(treeKey(id, d.view), d); setTree(d); revRef.current = d.revision ?? revRef.current }
  }, [id, view, loadTreeForView])

  // ── Synchronizacja zmian zewnętrznych w git (inny użytkownik / bezpośredni commit) ──
  // Polling lekkiego SHA HEAD; przy zmianie: w tle odśwież drzewo (bez migotania),
  // a dla otwartego dokumentu pokaż baner „zaktualizowano" (nigdy nie podmieniaj w trakcie edycji).
  const editingRef = useRef(editing); editingRef.current = editing
  const activeRef = useRef(active); activeRef.current = active
  useEffect(() => {
    if (!view) return
    let stopped = false
    const check = async () => {
      try {
        const r = await fetch(`/api/ws/${id}/revision?view=${encodeURIComponent(view)}`)
        if (!r.ok || stopped) return
        const { revision } = await r.json()
        if (!revision || !revRef.current || revision === revRef.current) return
        revRef.current = revision
        void reloadTree()
        if (activeRef.current && !editingRef.current) setDocStale(true)
      } catch { /* offline / ignore */ }
    }
    const iv = window.setInterval(check, 30000)
    const onFocus = () => { void check() }
    window.addEventListener('focus', onFocus)
    return () => { stopped = true; window.clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [id, view, reloadTree])

  const fileOp = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    if (!view) return false
    setBusy(true)
    try {
      const r = await fetch(`/api/ws/${id}/files?view=${encodeURIComponent(view)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (r.ok) return true
      const d = await r.json().catch(() => ({})); alert(d.message ?? `Operacja nieudana (HTTP ${r.status}).`); return false
    } finally { setBusy(false) }
  }, [id, view])

  const onNew = async () => {
    const path = prompt('Ścieżka nowego pliku (np. notatki/uwagi.md):')?.trim()
    if (!path) return
    if (await fileOp({ op: 'create', path, content: `# ${path.split('/').pop()}\n\n` })) { await reloadTree(); go(path) }
  }
  const onRename = async () => {
    setFileMenu(false); if (!active) return
    const toPath = prompt('Nowa ścieżka/nazwa:', active)?.trim()
    if (!toPath || toPath === active) return
    if (await fileOp({ op: 'rename', path: active, toPath })) { await reloadTree(); go(toPath) }
  }
  const onDuplicate = async () => {
    setFileMenu(false); if (!active) return
    const toPath = prompt('Ścieżka kopii:', active.replace(/(\.[^.]+)?$/, '-kopia$1'))?.trim()
    if (!toPath) return
    if (await fileOp({ op: 'duplicate', path: active, toPath })) { await reloadTree(); go(toPath) }
  }
  const onDelete = async () => {
    setFileMenu(false); if (!active) return
    if (!confirm(`Usunąć ${active}? (commit + push)`)) return
    if (await fileOp({ op: 'delete', path: active })) { await reloadTree(); router.push(hrefFor('', view), { scroll: false }) }
  }
  // szybka zmiana nazwy wyświetlanej (frontmatter `name`) — merge, nie rusza ścieżki pliku
  const onRenameDisplay = async () => {
    setFileMenu(false); if (!active || !view) return
    let current = ''
    try { const r = await fetch(`/api/ws/${id}/properties?view=${view}&path=${encodeURIComponent(active)}`); if (r.ok) current = String((await r.json()).meta?.name ?? '') } catch { /* prefill best-effort */ }
    const raw = prompt(t('viewer.renameDisplayPrompt'), current)
    if (raw === null) return
    const r = await fetch(`/api/ws/${id}/properties?view=${view}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: active, name: raw.trim() }) })
    if (r.ok) { await reloadTree(); loadedKey.current = null; void openFile(active) }
    else flashToast(t('viewer.saveError'))
  }

  // Synchronizacja repo jako zadanie w tle (kolejka Payload): zakolejkuj i odpytuj o status.
  const onSync = async () => {
    setFileMenu(false)
    flashToast(t('viewer.syncStarted'))
    try {
      const r = await fetch(`/api/ws/${id}/sync`, { method: 'POST' })
      if (!r.ok) { flashToast(t('viewer.syncFailed')); return }
      const poll = window.setInterval(async () => {
        const st = await fetch(`/api/ws/${id}/sync`).then((x) => x.json()).then((d) => d.status).catch(() => null)
        if (!st) return
        if (st.status === 'done') {
          window.clearInterval(poll)
          flashToast(t('viewer.syncDone', { files: st.output?.files ?? 0 }))
          loadedKey.current = null; await reloadTree(); if (active) void openFile(active)
        } else if (st.status === 'failed') {
          window.clearInterval(poll); flashToast(t('viewer.syncFailed'))
        }
      }, 1500)
      window.setTimeout(() => window.clearInterval(poll), 60000)
    } catch { flashToast(t('viewer.syncFailed')) }
  }

  const filterByTag = async (tag: string | null) => {
    setActiveTag(tag)
    if (!view || !tag) { await reloadTree(); return }
    const r = await fetch(`/api/ws/${id}/tree?view=${encodeURIComponent(view)}&tag=${encodeURIComponent(tag)}`)
    if (r.ok) { const d = await r.json(); setTree((t) => (t ? { ...t, files: d.files, nodes: d.nodes } : t)) }
  }

  const commentsMounted = Boolean(active && isMd(active) && !editing && view && openError === null)
  const otherViews = (tree?.allowedViews ?? []).filter((v) => v !== view)
  const crumbs = active ? active.split('/') : []

  // — pasek narzędzi dokumentu jako „ribbon" (grupy + etykiety) lub zwinięty do ikon —
  const ic = ribbonExpanded ? 17 : 15
  const rbtnCls = (on?: boolean, accent?: boolean) => ribbonExpanded
    ? `flex h-[3.1rem] min-w-[3.4rem] flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[10px] leading-none transition-colors disabled:opacity-50 ${on ? 'bg-secondary text-primary' : accent ? 'text-accent hover:bg-secondary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`
    : `grid h-7 w-7 place-items-center rounded-md transition-colors disabled:opacity-50 ${on ? 'bg-secondary text-primary' : accent ? 'text-accent hover:bg-secondary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`
  const RLabel = ({ children }: { children: ReactNode }) => (ribbonExpanded ? <span className="max-w-[5rem] truncate">{children}</span> : null)
  const RBtn = ({ icon, label, onClick, on, accent, disabled }: { icon: ReactNode; label: string; onClick: () => void; on?: boolean; accent?: boolean; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} className={rbtnCls(on, accent)}>{icon}<RLabel>{label}</RLabel></button>
  )
  const Grp = ({ label, children }: { label: string; children: ReactNode }) => ribbonExpanded ? (
    <div className="flex flex-col items-center gap-1 px-2 [&:not(:last-child)]:border-r [&:not(:last-child)]:border-border/60">
      <div className="flex items-end gap-0.5">{children}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{label}</div>
    </div>
  ) : <div className="flex items-center gap-0.5">{children}</div>

  const docGroups = active && isMd(active) ? (
    <>
      <Grp label={t('ribbon.document')}>
        <RBtn icon={<Link2 size={ic} />} label={t('viewer.docLink')} onClick={() => { void navigator.clipboard?.writeText(window.location.href); flashToast(t('viewer.copiedLink')) }} />
        {html && <RBtn icon={<ClipboardCopy size={ic} />} label={t('viewer.copyContent')} onClick={async () => {
          const el = contentRef.current
          if (!el) return
          try {
            if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
              await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([el.innerHTML], { type: 'text/html' }), 'text/plain': new Blob([el.innerText], { type: 'text/plain' }) })])
            } else { await navigator.clipboard?.writeText(el.innerText) }
            flashToast(t('viewer.copiedContent'))
          } catch { /* schowek niedostępny */ }
        }} />}
        <div className="relative" ref={styleRef}>
          <button onClick={() => setStylePop((s) => !s)} title={t('viewer.style')} aria-label={t('viewer.style')} className={rbtnCls(stylePop)}><Palette size={ic} /><RLabel>{t('viewer.style')}</RLabel></button>
          {stylePop && (
            <div className="absolute right-0 z-30 mt-1.5 max-h-[70vh] w-80 overflow-auto rounded-xl border border-border bg-popover/95 p-1.5 shadow-xl backdrop-blur">
              <div className="px-1.5 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('viewer.style')}</div>
              {THEMES.map((th) => (
                <button key={th} onClick={() => { setTheme(th); setStylePop(false) }}
                  className={`flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-secondary/70 ${theme === th ? 'bg-secondary/70 ring-1 ring-primary/30' : ''}`}>
                  <StyleSwatch s={th} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`text-sm ${theme === th ? 'font-medium text-primary' : ''}`}>{THEME_META[th].label}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{THEME_META[th].hint}</span>
                  </span>
                  {theme === th && <Check size={15} className="shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <RBtn icon={<Network size={ic} />} label={t('graph.open')} onClick={() => setShowGraph(true)} />
        {html && <RBtn icon={<Printer size={ic} />} label={t('viewer.pdf')} onClick={() => window.print()} />}
      </Grp>
      <Grp label={t('ribbon.collab')}>
        <RBtn icon={<MessageSquare size={ic} />} label={t('viewer.toggleComments')} on={isMobile ? mobileComments : showComments} onClick={onToggleComments} />
        {tree?.canUseAI && <RBtn icon={<Sparkles size={ic} />} label={t('ai.open')} accent onClick={() => setShowAi(true)} />}
      </Grp>
      <Grp label={t('ribbon.knowledge')}>
        <RBtn icon={<HistoryIcon size={ic} />} label={t('viewer.history')} onClick={() => setShowHistory(true)} />
        <RBtn icon={<SlidersHorizontal size={ic} />} label={t('viewer.properties')} onClick={() => setShowProps(true)} />
      </Grp>
      {canManage && (
        <Grp label={t('ribbon.file')}>
          <div className="relative" ref={fileRef}>
            <button onClick={() => setFileMenu((s) => !s)} disabled={busy} title={t('viewer.fileOps')} aria-label={t('viewer.fileOps')} aria-haspopup="menu" aria-expanded={fileMenu} className={rbtnCls(fileMenu)}><MoreHorizontal size={ic} /><RLabel>{t('viewer.fileOps')}</RLabel></button>
            {fileMenu && (
              <div className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-popover/95 p-1 text-sm shadow-xl backdrop-blur">
                {tree?.canEditProps && isMd(active) && <button onClick={onRenameDisplay} className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-secondary/70">{t('viewer.renameDisplay')}</button>}
                <button onClick={onRename} className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-secondary/70">{t('viewer.rename')}</button>
                <button onClick={onDuplicate} className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-secondary/70">{t('viewer.duplicate')}</button>
                <button onClick={onDelete} className="block w-full rounded-md px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/10">{t('viewer.delete')}</button>
                {tree?.canManageMembers && (<><div className="my-1 border-t border-border" /><button onClick={onSync} className="block w-full rounded-md px-2.5 py-1.5 text-left hover:bg-secondary/70">{t('viewer.syncRepo')}</button></>)}
              </div>
            )}
          </div>
        </Grp>
      )}
    </>
  ) : null

  return (
    <div className="flex h-screen flex-col">
      <AppHeader workspace={tree ? { id, name: tree.workspaceName, slug: tree.workspaceSlug } : undefined} onSearch={() => setPaletteOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        {/* EXPLORER — kolumna na desktopie, wysuwana szuflada na mobile */}
        {isMobile && mobileNav && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileNav(false)} />}
        {(isMobile || !sidebarCollapsed) && (
          <aside
            style={isMobile ? undefined : { width: sidebarWidth }}
            className={cn(
              'surface-chrome flex flex-col overflow-hidden border-r border-border p-3',
              isMobile
                ? `fixed inset-y-0 left-0 z-40 w-[85vw] max-w-xs transition-transform duration-200 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`
                : 'relative shrink-0',
            )}
          >
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!tree && !error && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</p>}
            {tree && view && (
              <DocsTree
                nodes={tree.nodes ?? []} active={active} onOpen={(p) => { setMobileNav(false); go(p) }} storageKey={`${id}:${view}`}
                workspaceId={id} view={view} recentPaths={recent}
                onNewFile={canManage ? onNew : undefined}
                tags={tags} activeTag={activeTag} onToggleTag={(tg) => { void filterByTag(tg) }}
                canEditProps={tree.canEditProps} onChanged={() => { void reloadTree() }}
              />
            )}
            {/* uchwyt zmiany szerokości panelu (tylko desktop) */}
            {!isMobile && <div onMouseDown={startResize} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize transition-colors hover:bg-primary/30" />}
          </aside>
        )}

        {/* DOCUMENT */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {tree && view && (
            <>
            <div className="surface-chrome flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
              <button onClick={onToggleNav} title={sidebarCollapsed ? t('viewer.expandSidebar') : t('viewer.collapseSidebar')} aria-label={t('viewer.expandSidebar')}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                {isMobile ? <Menu size={16} /> : sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
              {tree.allowedViews.length > 1 && (
                <Select value={view} onChange={(e) => goView(e.target.value)} className="h-7 w-auto text-xs" title={t('viewer.openInView')}>
                  {tree.allowedViews.map((v) => <option key={v} value={v}>{viewLabel(v)}</option>)}
                </Select>
              )}
              {tree.canManageMembers && (
                <Link href={`/ws/${id}/members`} title={t('members.manage')} aria-label={t('members.manage')}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  <Users size={16} />
                </Link>
              )}
              {tree.canViewReports && (
                <Link href={`/ws/${id}/reports`} title={t('reports.title')} aria-label={t('reports.title')}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  <BarChart3 size={16} />
                </Link>
              )}
              {active && !editing && openError === null && (
                <nav className="flex min-w-0 items-center text-xs text-muted-foreground">
                  {crumbs.map((c, i) => (
                    <span key={i} className="flex min-w-0 items-center">
                      {i > 0 && <span className="px-1 text-muted-foreground/40">/</span>}
                      <span className={`truncate ${i === crumbs.length - 1 ? 'font-medium text-foreground' : ''}`}>{c}</span>
                    </span>
                  ))}
                </nav>
              )}
              {active && !editing && openError === null && (
              <div className="ml-auto flex items-center gap-1.5">
                {presence.length > 0 && (
                  <div className="mr-1 flex items-center -space-x-1.5" aria-label={t('presence.label')} title={presence.map((p) => `${p.name || p.email || ''} (${t(`presence.${p.activity}`)})`).join(', ')}>
                    {presence.slice(0, 4).map((p) => (
                      <span key={p.userId} className="rounded-full ring-2 ring-background">
                        <Avatar name={p.name} email={p.email ?? undefined} size={22} />
                      </span>
                    ))}
                    {presence.length > 4 && <span className="ml-1 text-[11px] text-muted-foreground">+{presence.length - 4}</span>}
                  </div>
                )}
                {/* zwinięty ribbon: grupy ikon inline w pasku */}
                {!ribbonExpanded && docGroups && (
                  <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/60 p-0.5">{docGroups}</div>
                )}
                {docGroups && (
                  <button onClick={toggleRibbon} title={ribbonExpanded ? t('ribbon.collapse') : t('ribbon.expand')} aria-label={ribbonExpanded ? t('ribbon.collapse') : t('ribbon.expand')} aria-expanded={ribbonExpanded}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                    {ribbonExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                )}
                {isMd(active) && <ApprovalControl workspaceId={id} view={view!} path={active} />}
                {canEdit && raw !== null && (
                  <Button size="sm" onClick={() => setEditing(true)} className="h-8 gap-1.5">
                    <Edit3 size={14} /> {t('viewer.edit')}
                  </Button>
                )}
              </div>
              )}
            </div>
            {/* drugi wiersz: rozwinięty ribbon z grupami i etykietami */}
            {ribbonExpanded && active && !editing && openError === null && docGroups && (
              <div className="surface-chrome flex flex-wrap items-stretch gap-1 border-b border-border px-3 py-1">
                {docGroups}
              </div>
            )}
            </>
          )}

          {/* taby bundla */}
          {active && !editing && activeTabs && activeTabs.length > 0 && (
            <div className="flex items-center gap-1 border-b border-border px-4 py-1.5">
              {activeTabs.map((t) => (
                <button key={t.path} onClick={() => go(t.path)}
                  className={`rounded px-2 py-1 text-xs transition-colors ${active === t.path ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-secondary/60'}`}>{t.label}</button>
              ))}
            </div>
          )}

          {docStale && active && !editing && (
            <div className="flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlert size={14} className="shrink-0" />
              <span className="flex-1">{t('viewer.updatedUpstream')}</span>
              <button onClick={() => { loadedKey.current = null; void openFile(active) }} className="rounded-md border border-amber-500/40 px-2 py-0.5 font-medium hover:bg-amber-500/20">{t('viewer.reload')}</button>
              <button onClick={() => setDocStale(false)} className="rounded-md px-1.5 py-0.5 hover:bg-amber-500/20" title="✕">✕</button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            {editing && raw !== null && view ? (
              <DocEditor workspaceId={id} view={view} path={active!} initialMarkdown={raw} docStyle={theme}
                onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); loadedKey.current = null; void openFile(active!) }} />
            ) : openError !== null ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md rounded-lg border border-border bg-card/60 p-6 text-center">
                  <div className={`mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full ${openError === 403 ? 'bg-primary/10 text-primary' : openError === 404 ? 'bg-secondary text-muted-foreground' : 'bg-accent/10 text-accent'}`}>
                    {openError === 404 ? <FileQuestion size={24} /> : openError === 403 ? <Lock size={24} /> : <TriangleAlert size={24} />}
                  </div>
                  <h2 className="mb-1 text-lg font-semibold">
                    {openError === 404 ? t('viewer.notFoundTitle') : openError === 403 ? t('viewer.forbiddenTitle') : t('viewer.errorTitle')}
                  </h2>
                  <p className="mb-1 break-all font-mono text-xs text-muted-foreground">{active}</p>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {openError === 404
                      ? 'Plik nie istnieje w tym workspace lub został przeniesiony.'
                      : openError === 403
                        ? 'Ten dokument nie jest widoczny w bieżącym widoku. Spróbuj innego widoku, do którego masz dostęp.'
                        : 'Wystąpił błąd sieci lub serwera. Spróbuj ponownie.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {openError === 403 && otherViews.map((v) => (
                      <Button key={v} size="sm" variant="outline" onClick={() => goView(v)}>
                        {t('viewer.openInView')} {viewLabel(v)}
                      </Button>
                    ))}
                    {openError === 0 && active && <Button size="sm" variant="outline" onClick={() => { loadedKey.current = null; void openFile(active) }}>Spróbuj ponownie</Button>}
                    <Button size="sm" variant="ghost" onClick={() => router.push(hrefFor('', view), { scroll: false })}>{t('viewer.backToWorkspace')}</Button>
                  </div>
                </div>
              </div>
            ) : html ? (
              <>
                <div ref={contentRef} onClick={onContentClick} className={`doc-content docs-style-${theme}`} dangerouslySetInnerHTML={{ __html: html }} />
                <MermaidHydrator trigger={html} />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">{t('viewer.selectDoc')}</div>
            )}
          </div>
        </section>

        {commentsMounted && (isMobile ? (
          <>
            {mobileComments && <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setMobileComments(false)} />}
            <div className={cn('fixed inset-y-0 right-0 z-40 flex w-80 max-w-[88vw] transition-transform duration-200', mobileComments ? 'translate-x-0' : 'translate-x-full')}>
              <CommentsPanel workspaceId={id} view={view!} path={active!} contentRef={contentRef} collapsed={false} onToggleCollapse={() => setMobileComments(false)} canAccept={canEdit} />
            </div>
          </>
        ) : (
          <CommentsPanel workspaceId={id} view={view!} path={active!} contentRef={contentRef} collapsed={!showComments} onToggleCollapse={() => setShowComments((s) => !s)} canAccept={canEdit} />
        ))}
      </div>

      {showHistory && active && view && (
        <HistoryDialog workspaceId={id} view={view} path={active} onClose={() => setShowHistory(false)}
          canRestore={canEdit} onRestored={() => { loadedKey.current = null; void openFile(active); void reloadTree() }} />
      )}
      {showProps && active && view && (
        <PropertiesDialog workspaceId={id} view={view} path={active}
          onClose={() => setShowProps(false)} onSaved={() => { loadedKey.current = null; void openFile(active) }} />
      )}
      {showGraph && active && view && (
        <DocGraphDialog workspaceId={id} view={view} path={active} onOpen={go} onClose={() => setShowGraph(false)} />
      )}
      {showAi && active && view && (
        <AiApplyDialog workspaceId={id} view={view} path={active} currentContent={raw ?? ''}
          onClose={() => setShowAi(false)}
          onSaved={() => { loadedKey.current = null; void openFile(active) }} />
      )}
      <CommandPalette open={paletteOpen} files={tree?.files ?? []} recent={recent} workspaceId={id} view={view ?? ''} onClose={() => setPaletteOpen(false)} onOpen={go} />

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-1.5 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
