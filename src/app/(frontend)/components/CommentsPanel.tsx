'use client'

import { type ChangeEvent, type KeyboardEvent, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CornerUpLeft, MessageSquarePlus, MessagesSquare, PanelRightClose, PanelRightOpen, RotateCcw, Send, Sparkles, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { useTranslation } from '@/i18n/client'
import { relativeTime } from '@/i18n/datetime'
import { Spinner } from '@/components/ui/spinner'
import { computeAnchorParts, matchAnchor } from '@/lib/comments/anchor-match'

interface Comment {
  id: number | string
  kind: 'inline' | 'document'
  body: string
  quote?: string | null
  prefix?: string | null
  suffix?: string | null
  status: 'open' | 'resolved'
  accepted?: boolean | null
  parent?: { id: number | string } | number | string | null
  authorName?: string | null
  authorEmail?: string | null
  authorSub?: string | null
  reactions?: { emoji: string; authorSub: string }[] | null
  createdAt?: string
}

const REACTIONS = ['👍', '✅', '❓', '🎯', '🚀'] as const

interface Member { id: number | string; name: string | null; email: string; handle: string }

function offsetsIn(container: HTMLElement): { start: number; end: number; text: string } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const pre = range.cloneRange()
  pre.selectNodeContents(container)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  const text = range.toString()
  if (!text.trim()) return null
  return { start, end: start + text.length, text }
}

function rangeFromOffsets(container: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let off = 0
  let startNode: Node | null = null
  let startOff = 0
  let endNode: Node | null = null
  let endOff = 0
  let n: Node | null
  while ((n = walker.nextNode())) {
    const len = n.nodeValue?.length ?? 0
    if (startNode === null && off + len >= start) { startNode = n; startOff = start - off }
    if (off + len >= end) { endNode = n; endOff = end - off; break }
    off += len
  }
  if (!startNode || !endNode) return null
  const r = document.createRange()
  try { r.setStart(startNode, startOff); r.setEnd(endNode, endOff) } catch { return null }
  return r
}

// usuń istniejące znaczniki komentarzy, przywracając zwykły tekst
function unwrapMarks(root: HTMLElement) {
  root.querySelectorAll('mark.osnova-cmark').forEach((m) => {
    const p = m.parentNode
    if (!p) return
    while (m.firstChild) p.insertBefore(m.firstChild, m)
    p.removeChild(m)
  })
  root.normalize()
}

// zawiń zakres znaków [start,end) (offsety w textContent) w elementy tworzone przez makeMark
function wrapOffsets(root: HTMLElement, start: number, end: number, makeMark: () => HTMLElement) {
  if (end <= start) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let off = 0
  const targets: { node: Text; from: number; to: number }[] = []
  let n: Node | null
  while ((n = walker.nextNode())) {
    const len = n.nodeValue?.length ?? 0
    const nodeStart = off
    const nodeEnd = off + len
    if (nodeEnd > start && nodeStart < end) {
      targets.push({ node: n as Text, from: Math.max(0, start - nodeStart), to: Math.min(len, end - nodeStart) })
    }
    off = nodeEnd
    if (off >= end) break
  }
  for (const t of targets) {
    if (t.to <= t.from) continue
    try {
      const r = document.createRange()
      r.setStart(t.node, t.from)
      r.setEnd(t.node, t.to)
      r.surroundContents(makeMark())
    } catch { /* zakres przecina granice elementów — pomiń ten fragment */ }
  }
}

export function CommentsPanel({
  workspaceId, view, path, contentRef, collapsed, onToggleCollapse, canAccept = false,
}: {
  workspaceId: string
  view: string
  path: string
  contentRef: RefObject<HTMLDivElement | null>
  collapsed: boolean
  onToggleCollapse: () => void
  canAccept?: boolean
}) {
  const { t, i18n } = useTranslation()
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [canComment, setCanComment] = useState(false)
  const [body, setBody] = useState('')
  const [pending, setPending] = useState<{ quote: string; prefix: string; suffix: string } | null>(null)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [busy, setBusy] = useState(false)
  const [meId, setMeId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [mention, setMention] = useState<{ query: string; start: number; end: number } | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [selRect, setSelRect] = useState<{ top: number; left: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const obsRef = useRef<MutationObserver | null>(null)

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((d) => { if (d.authenticated) setMeId(String(d.id)) }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/ws/${workspaceId}/members?view=${encodeURIComponent(view)}`)
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembers(d.members ?? [])).catch(() => setMembers([]))
  }, [workspaceId, view])

  const handleToName = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of members) m.set(u.handle, u.name || u.handle)
    return m
  }, [members])

  const mentionMatches = useMemo(() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    return members
      .filter((u) => u.handle.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 6)
  }, [mention, members])

  const onBodyChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setBody(value)
    const caret = e.target.selectionStart ?? value.length
    const upto = value.slice(0, caret)
    const m = /(^|\s)@([\w.-]*)$/.exec(upto)
    if (m) { setMention({ query: m[2], start: caret - m[2].length - 1, end: caret }); setMentionIdx(0) }
    else setMention(null)
  }

  const insertMention = (u: Member) => {
    if (!mention) return
    const next = `${body.slice(0, mention.start)}@${u.handle} ${body.slice(mention.end)}`
    setBody(next)
    setMention(null)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) { const pos = mention.start + u.handle.length + 2; el.focus(); el.setSelectionRange(pos, pos) }
    })
  }

  const onBodyKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention || mentionMatches.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionMatches.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionMatches.length) % mentionMatches.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIdx] ?? mentionMatches[0]) }
    else if (e.key === 'Escape') { setMention(null) }
  }

  const renderBody = (text: string) => {
    const parts = text.split(/(@[\w.-]+)/g)
    return parts.map((part, i) => {
      const mm = /^@([\w.-]+)$/.exec(part)
      if (mm && handleToName.has(mm[1])) {
        return <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary" title={handleToName.get(mm[1])}>@{handleToName.get(mm[1])}</span>
      }
      return <span key={i}>{part}</span>
    })
  }

  const load = useCallback(() => {
    setComments(null)
    fetch(`/api/ws/${workspaceId}/comments?view=${encodeURIComponent(view)}&path=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? r.json() : { comments: [], canComment: false }))
      .then((d) => { setComments(d.comments ?? []); setCanComment(Boolean(d.canComment)) })
      .catch(() => setComments([]))
  }, [workspaceId, view, path])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      const payload: any = { path, body, kind: pending ? 'inline' : 'document', parent: replyTo?.id ?? null }
      if (pending) Object.assign(payload, pending)
      const r = await fetch(`/api/ws/${workspaceId}/comments?view=${encodeURIComponent(view)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (r.ok) { setBody(''); setPending(null); setReplyTo(null); load() }
      else { const d = await r.json().catch(() => ({})); alert(d.message ?? `Błąd (${r.status})`) }
    } finally { setBusy(false) }
  }

  const setStatus = async (c: Comment, status: 'open' | 'resolved') => {
    await fetch(`/api/ws/${workspaceId}/comments?view=${encodeURIComponent(view)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, status }),
    })
    load()
  }
  const toggleAccepted = async (c: Comment) => {
    await fetch(`/api/ws/${workspaceId}/comments?view=${encodeURIComponent(view)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, accepted: !c.accepted }),
    })
    load()
  }
  const remove = async (c: Comment) => {
    if (!confirm('Usunąć komentarz?')) return
    await fetch(`/api/ws/${workspaceId}/comments?view=${encodeURIComponent(view)}&id=${c.id}`, { method: 'DELETE' })
    load()
  }
  const react = async (c: Comment, emoji: string) => {
    await fetch(`/api/ws/${workspaceId}/comments?view=${encodeURIComponent(view)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, reaction: emoji }),
    })
    load()
  }

  // rozpocznij komentarz inline z bieżącego zaznaczenia (z pływającego paska nad tekstem)
  const startInlineComment = () => {
    const el = contentRef.current
    if (!el) return
    const o = offsetsIn(el)
    if (!o) return
    const parts = computeAnchorParts(el.textContent ?? '', o.start, o.end)
    setPending(parts); setReplyTo(null); setSelRect(null)
    if (collapsed) onToggleCollapse()
    window.getSelection()?.removeAllRanges()
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const jumpTo = (c: Comment) => {
    const el = contentRef.current
    if (!el || !c.quote) return
    const m = matchAnchor(el.textContent ?? '', { quote: c.quote, prefix: c.prefix ?? '', suffix: c.suffix ?? '' })
    if (!m) { alert('Fragment nie został odnaleziony (treść się zmieniła).'); return }
    const r = rangeFromOffsets(el, m.index, m.index + m.length)
    if (!r) return
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r)
    ;(r.startContainer.parentElement ?? el).scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const anchored = (c: Comment): boolean | null => {
    if (c.kind !== 'inline' || !c.quote) return null
    const el = contentRef.current
    if (!el) return null
    return matchAnchor(el.textContent ?? '', { quote: c.quote, prefix: c.prefix ?? '', suffix: c.suffix ?? '' }) !== null
  }

  // klik znacznika w treści → przewiń panel do wątku i podświetl go
  const scrollToComment = useCallback((id: Comment['id']) => {
    const card = document.getElementById(`osnova-cmt-${id}`)
    card?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlashId(String(id))
    window.setTimeout(() => setFlashId((cur) => (cur === String(id) ? null : cur)), 1600)
  }, [])

  // podświetl w treści fragmenty z komentarzami inline (jak w Confluence)
  const highlightInline = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    obsRef.current?.disconnect()
    unwrapMarks(el)
    const text = el.textContent ?? ''
    const inline = (comments ?? []).filter((c) => !c.parent && c.kind === 'inline' && c.quote)
    for (const c of inline) {
      const m = matchAnchor(text, { quote: c.quote as string, prefix: c.prefix ?? '', suffix: c.suffix ?? '' })
      if (!m) continue
      wrapOffsets(el, m.index, m.index + m.length, () => {
        const mark = document.createElement('mark')
        mark.className = 'osnova-cmark'
        mark.dataset.cid = String(c.id)
        if (c.status === 'resolved') mark.dataset.resolved = '1'
        mark.title = `Komentarz: ${c.authorName || c.authorEmail || 'użytkownik'}`
        mark.addEventListener('click', (e) => { e.stopPropagation(); scrollToComment(c.id) })
        return mark
      })
    }
    if (el.isConnected && obsRef.current) obsRef.current.observe(el, { childList: true, subtree: true, characterData: true })
  }, [comments, scrollToComment])

  // utrzymuj znaczniki aktualne: po zmianie komentarzy oraz gdy treść się przerenderuje
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const obs = new MutationObserver(() => { requestAnimationFrame(highlightInline) })
    obsRef.current = obs
    highlightInline()
    return () => { obs.disconnect(); obsRef.current = null; unwrapMarks(el) }
  }, [highlightInline, contentRef])

  // pływający pasek „Dodaj komentarz" przy zaznaczeniu tekstu w treści
  useEffect(() => {
    if (!canComment) return
    const update = () => {
      const el = contentRef.current
      const sel = window.getSelection()
      if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) { setSelRect(null); return }
      const range = sel.getRangeAt(0)
      if (!el.contains(range.commonAncestorContainer) || !range.toString().trim()) { setSelRect(null); return }
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) { setSelRect(null); return }
      setSelRect({ top: rect.top, left: rect.left + rect.width / 2 })
    }
    const onMouseUp = () => window.setTimeout(update, 0)
    const onSelChange = () => { const s = window.getSelection(); if (!s || s.isCollapsed) setSelRect(null) }
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('selectionchange', onSelChange)
    return () => { document.removeEventListener('mouseup', onMouseUp); document.removeEventListener('selectionchange', onSelChange) }
  }, [canComment, contentRef])

  const tops = (comments ?? []).filter((c) => !c.parent)
  const repliesOf = (id: Comment['id']) =>
    (comments ?? []).filter((c) => c.parent && String(typeof c.parent === 'object' ? c.parent.id : c.parent) === String(id))

  const Card = ({ c, reply }: { c: Comment; reply?: boolean }) => {
    const a = anchored(c)
    return (
      <div id={`osnova-cmt-${c.id}`} className={`scroll-mt-2 rounded-xl border p-3 transition-all ${reply ? 'ml-5 mt-2' : ''} ${c.status === 'resolved' ? 'border-border/60 bg-card/40 opacity-75' : 'border-border bg-card/70'} ${flashId === String(c.id) ? 'border-primary ring-2 ring-primary/40' : ''}`}>
        <div className="flex items-start gap-2">
          <Avatar name={c.authorName} email={c.authorEmail ?? undefined} size={26} />
          {/* zawijaj: przy wąskim panelu data i plakietki schodzą pod nazwę zamiast nachodzić */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="max-w-full truncate text-sm font-medium text-foreground/90">{c.authorName || c.authorEmail || 'użytkownik'}</span>
            {c.createdAt && <span className="shrink-0 text-[11px] text-muted-foreground">· {relativeTime(c.createdAt, i18n.language, t('common.now'))}</span>}
            {c.accepted && !reply && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                <Sparkles size={11} /> {t('comments.acceptedForAi')}
              </span>
            )}
            {c.status === 'resolved' && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <CheckCircle2 size={11} /> {t('comments.resolved')}
              </span>
            )}
          </div>
        </div>
        {c.kind === 'inline' && c.quote && (
          <button onClick={() => jumpTo(c)} title="Pokaż w tekście" className="mt-2 block w-full truncate rounded-md border-l-2 border-primary/50 bg-primary/5 px-2 py-1 text-left text-xs italic text-muted-foreground hover:text-primary">
            „{c.quote}”
          </button>
        )}
        {c.kind === 'inline' && a === false && <div className="mt-1 text-[11px] text-accent">fragment nieodnaleziony (treść się zmieniła)</div>}
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{renderBody(c.body)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {REACTIONS.map((emoji) => {
            const list = (c.reactions ?? []).filter((r) => r.emoji === emoji)
            const mine = meId != null && list.some((r) => String(r.authorSub) === meId)
            if (list.length === 0 && !canComment) return null
            return (
              <button
                key={emoji}
                disabled={!canComment}
                onClick={() => react(c, emoji)}
                title={canComment ? (mine ? 'Cofnij reakcję' : 'Dodaj reakcję') : undefined}
                className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${mine ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'} ${!canComment ? 'cursor-default' : ''}`}
              >
                <span>{emoji}</span>
                {list.length > 0 && <span className="tabular-nums">{list.length}</span>}
              </button>
            )
          })}
        </div>
        {canComment && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/50 pt-2 text-xs">
            {!reply && (
              <button className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary" onClick={() => { setReplyTo(c); setPending(null); textareaRef.current?.focus() }}>
                <CornerUpLeft size={12} /> {t('comments.reply')}
              </button>
            )}
            {c.status === 'open'
              ? <button className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary" onClick={() => setStatus(c, 'resolved')}><CheckCircle2 size={12} /> {t('comments.resolve')}</button>
              : <button className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary" onClick={() => setStatus(c, 'open')}><RotateCcw size={12} /> {t('comments.reopen')}</button>}
            {canAccept && !reply && (
              <button onClick={() => toggleAccepted(c)} title={t('comments.acceptForAiHint')}
                className={`inline-flex items-center gap-1 transition-colors ${c.accepted ? 'text-accent' : 'text-muted-foreground hover:text-accent'}`}>
                <Sparkles size={12} /> {c.accepted ? t('comments.unacceptForAi') : t('comments.acceptForAi')}
              </button>
            )}
            <button className="ml-auto inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-destructive" onClick={() => remove(c)}><Trash2 size={12} /> {t('comments.remove')}</button>
          </div>
        )}
      </div>
    )
  }

  const selectionToolbar = canComment && selRect ? (
    <button
      onMouseDown={(e) => { e.preventDefault(); startInlineComment() }}
      style={{ position: 'fixed', top: Math.max(8, selRect.top - 42), left: selRect.left, transform: 'translateX(-50%)', zIndex: 50 }}
      className="flex items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-xs font-medium shadow-xl backdrop-blur transition-colors hover:bg-secondary"
    >
      <MessageSquarePlus size={14} className="text-primary" /> {t('comments.addSelection')}
    </button>
  ) : null

  if (collapsed) {
    return (
      <>
        {selectionToolbar}
        <aside className="osnova-panel-l surface-chrome flex w-10 shrink-0 flex-col items-center gap-3 border-l border-border py-3">
          <button onClick={onToggleCollapse} title={t('comments.expand')} className="relative grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <PanelRightOpen size={16} />
            {tops.length > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-[15px] place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-[15px] text-primary-foreground">{tops.length}</span>
            )}
          </button>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ writingMode: 'vertical-rl' }}>{t('comments.title')}</span>
        </aside>
      </>
    )
  }

  return (
    <>
      {selectionToolbar}
      <aside className="osnova-panel-l surface-chrome flex w-full flex-col border-l border-border md:w-80 md:shrink-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <MessagesSquare size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">{t('comments.title')}</span>
          {tops.length > 0 && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{tops.length}</span>}
        </div>
        <button onClick={onToggleCollapse} title={t('comments.collapse')} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <PanelRightClose size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-auto p-3">
        {comments === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Ładowanie…</p>
        ) : tops.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <MessagesSquare size={30} className="opacity-30" />
            <p className="text-sm">{t('comments.empty')}</p>
            {canComment && <p className="max-w-[12rem] text-xs">{t('comments.hint')}</p>}
          </div>
        ) : (
          tops.map((c) => (
            <div key={String(c.id)}>
              <Card c={c} />
              {repliesOf(c.id).map((r) => <Card key={String(r.id)} c={r} reply />)}
            </div>
          ))
        )}
      </div>

      {canComment && (
        <div className="border-t border-border bg-card/50 p-3">
          {pending && (
            <div className="mb-1.5 flex items-center gap-1 truncate rounded-md border-l-2 border-primary/60 bg-primary/5 px-2 py-1 text-xs italic text-muted-foreground">
              <span className="truncate">w tekście: „{pending.quote}”</span>
              <button className="ml-auto not-italic text-destructive hover:text-destructive/80" onClick={() => setPending(null)}>✕</button>
            </div>
          )}
          {replyTo && (
            <div className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
              <CornerUpLeft size={12} /> odpowiedź do: <span className="font-medium text-foreground/80">{replyTo.authorName || replyTo.authorEmail}</span>
              <button className="ml-auto text-destructive hover:text-destructive/80" onClick={() => setReplyTo(null)}>✕</button>
            </div>
          )}
          <div className="relative flex items-end gap-2 rounded-xl border border-input bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring">
            {mention && mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-0 z-30 mb-1.5 max-h-48 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-xl">
                {mentionMatches.map((u, i) => (
                  <button
                    key={String(u.id)}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(u) }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${i === mentionIdx ? 'bg-secondary text-primary' : 'hover:bg-secondary/60'}`}
                  >
                    <Avatar name={u.name} email={u.email} size={22} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{u.name || u.handle}</span>
                      <span className="truncate text-[11px] text-muted-foreground">@{u.handle}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={body} onChange={onBodyChange} onKeyDown={onBodyKeyDown}
              rows={2}
              placeholder={t('comments.placeholder')}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-1.5 py-1 text-sm focus-visible:outline-none"
            />
            <button
              onClick={submit}
              disabled={busy || !body.trim()}
              title={t('comments.send')}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {busy ? <Spinner /> : <Send size={15} />}
            </button>
          </div>
        </div>
      )}
      </aside>
    </>
  )
}
