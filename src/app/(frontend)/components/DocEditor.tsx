'use client'

import StarterKit from '@tiptap/starter-kit'
import { BubbleMenu, type Editor, EditorContent, useEditor } from '@tiptap/react'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Markdown } from 'tiptap-markdown'
import {
  Bold, Code, Code2, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, Link2Off,
  List, ListChecks, ListOrdered, Minus, Paperclip, Pilcrow, Quote, Redo2, Strikethrough, Undo2,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/client'
import { editorUrl, toEditorMarkdown, toStorageMarkdown } from '@/lib/editor/asset-links'
import { ConflictDialog } from './ConflictDialog'

type Mode = 'wysiwyg' | 'raw'

export function DocEditor(props: {
  workspaceId: string
  view: string
  path: string
  initialMarkdown: string
  onCancel: () => void
  onSaved: () => void
  docStyle?: string
}) {
  const { workspaceId, view, path, initialMarkdown, onCancel, onSaved, docStyle = 'editorial' } = props
  const { t } = useTranslation()
  const docDir = useMemo(() => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''), [path])
  const apiPrefix = useMemo(() => `/api/ws/${workspaceId}/file?view=${encodeURIComponent(view)}&path=`, [workspaceId, view])

  const [mode, setMode] = useState<Mode>('wysiwyg')
  const [raw, setRaw] = useState(initialMarkdown)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const [conflict, setConflict] = useState<{ yours: string; theirs: string; remoteRevision?: string } | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const imgInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, linkify: true, transformPastedText: true, transformCopiedText: true }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow' } }),
      Image.configure({ inline: false, HTMLAttributes: { class: 'doc-img' } }),
      Placeholder.configure({ placeholder: t('editor.placeholder') }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: toEditorMarkdown(initialMarkdown, apiPrefix, docDir),
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'osnova-pm min-h-[55vh] focus:outline-none' },
      handlePaste: (_v, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (files.length === 0) return false
        event.preventDefault()
        void uploadMany(files)
        return true
      },
      handleDrop: (_v, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? [])
        if (files.length === 0) return false
        event.preventDefault()
        void uploadMany(files)
        return true
      },
    },
    onUpdate: () => setDirty(true),
  })
  editorRef.current = editor

  const currentMarkdown = useCallback((): string =>
    mode === 'raw' ? raw : toStorageMarkdown(editor?.storage.markdown?.getMarkdown?.() ?? raw, apiPrefix, docDir),
    [mode, raw, editor, apiPrefix, docDir])

  const switchMode = (next: Mode) => {
    if (next === mode) return
    if (next === 'raw') setRaw(toStorageMarkdown(editor?.storage.markdown?.getMarkdown?.() ?? raw, apiPrefix, docDir))
    else editor?.commands.setContent(toEditorMarkdown(raw, apiPrefix, docDir))
    setMode(next)
  }

  // ── upload załączników ─────────────────────────────────────────────────────
  const insertUploaded = useCallback((res: { rel: string; name: string; kind: 'image' | 'file' }) => {
    const ed = editorRef.current
    if (!ed) return
    const isPdf = /\.pdf$/i.test(res.name) || /\.pdf$/i.test(res.rel)
    if (res.kind === 'image' || isPdf) {
      // obraz LUB PDF → składnia obrazka; PDF renderuje się w podglądzie jako osadzony viewer (iframe)
      ed.chain().focus().setImage({ src: editorUrl(res.rel, apiPrefix, docDir), alt: res.name }).run()
    } else {
      ed.chain().focus().insertContent({ type: 'text', text: res.name, marks: [{ type: 'link', attrs: { href: res.rel } }] }).insertContent(' ').run()
    }
    setDirty(true)
  }, [apiPrefix, docDir])

  const uploadMany = useCallback(async (files: File[]) => {
    setUploading(true)
    setMsg(null)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('docPath', path)
        const res = await fetch(`/api/ws/${workspaceId}/attachments?view=${encodeURIComponent(view)}`, { method: 'POST', body: fd })
        if (res.ok) {
          insertUploaded(await res.json())
        } else {
          const d = await res.json().catch(() => ({}))
          setMsg({ kind: 'error', text: d.error ?? d.message ?? `Błąd wgrywania (HTTP ${res.status}).` })
        }
      }
    } finally {
      setUploading(false)
    }
  }, [workspaceId, view, path, insertUploaded])

  const pickFiles = (ref: typeof imgInputRef) => ref.current?.click()
  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) await uploadMany(files)
  }

  // Wspólny zapis. Zwraca 'conflict', gdy zdalna wersja się rozjechała — wtedy otwiera
  // kreator rozwiązania (FR-19a) z obiema wersjami; nie ustawia komunikatu błędu.
  const postSave = useCallback(async (content: string): Promise<'ok' | 'conflict' | 'error'> => {
    const res = await fetch(`/api/ws/${workspaceId}/file?view=${encodeURIComponent(view)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    })
    if (res.ok) return 'ok'
    const d = await res.json().catch(() => ({}))
    if (res.status === 409 && d.conflict) {
      setConflict({ yours: content, theirs: typeof d.theirs === 'string' ? d.theirs : '', remoteRevision: d.remoteRevision })
      return 'conflict'
    }
    if (res.status === 409) setMsg({ kind: 'error', text: d.message ?? t('editor.errConflict') })
    else if (res.status === 403) setMsg({ kind: 'error', text: t('editor.errForbidden') })
    else setMsg({ kind: 'error', text: `Błąd zapisu (HTTP ${res.status}).` })
    return 'error'
  }, [workspaceId, view, path, t])

  const save = useCallback(async () => {
    setSaving(true)
    setMsg(null)
    try {
      if (await postSave(currentMarkdown()) === 'ok') onSaved()
    } catch (e) {
      setMsg({ kind: 'error', text: `Błąd sieci: ${String((e as Error).message)}` })
    } finally {
      setSaving(false)
    }
  }, [postSave, currentMarkdown, onSaved])

  // zapis rozwiązania z kreatora — worktree jest już wyrównany do origin, więc treść
  // nakłada się czysto; jeśli zdalne znów się ruszyło, postSave odświeży kreator
  const resolveConflict = useCallback(async (resolved: string) => {
    setSaving(true)
    setMsg(null)
    try {
      const r = await postSave(resolved)
      if (r === 'ok') { setConflict(null); onSaved() }
    } catch (e) {
      setMsg({ kind: 'error', text: `Błąd sieci: ${String((e as Error).message)}` })
    } finally {
      setSaving(false)
    }
  }, [postSave, onSaved])

  const cancel = () => {
    if (dirty && !window.confirm(t('editor.discardConfirm'))) return
    onCancel()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!saving) void save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, saving])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt(t('editor.linkPrompt'), prev ?? 'https://')
    if (url === null) return
    if (url.trim() === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }, [editor])

  const text = mode === 'raw' ? raw : (editor?.getText() ?? '')
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  const Tb = ({ title, active, disabled, on, children }: { title: string; active?: boolean; disabled?: boolean; on: () => void; children: ReactNode }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      disabled={disabled}
      className={cn('grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40', active && 'bg-secondary text-primary')}
    >
      {children}
    </button>
  )
  const Sep = () => <span className="mx-0.5 h-5 w-px bg-border" />

  return (
    <div className="flex h-full flex-col">
      {conflict && (
        <ConflictDialog
          yours={conflict.yours}
          theirs={conflict.theirs}
          remoteRevision={conflict.remoteRevision}
          saving={saving}
          onResolve={resolveConflict}
          onCancel={() => setConflict(null)}
        />
      )}
      <input ref={imgInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" multiple hidden onChange={onPicked} />
      <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx" multiple hidden onChange={onPicked} />

      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-card/50 px-3 py-1.5 backdrop-blur">
        <div className="mr-1 inline-flex overflow-hidden rounded-md border border-border">
          <button onClick={() => switchMode('wysiwyg')} className={cn('px-2.5 py-1 text-xs', mode === 'wysiwyg' ? 'bg-secondary text-primary' : 'hover:bg-secondary/60')}>WYSIWYG</button>
          <button onClick={() => switchMode('raw')} className={cn('px-2.5 py-1 text-xs', mode === 'raw' ? 'bg-secondary text-primary' : 'hover:bg-secondary/60')}>Markdown</button>
        </div>

        {mode === 'wysiwyg' && editor && (
          <div className="flex items-center">
            <Tb title={t('editor.undo')} on={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 size={16} /></Tb>
            <Tb title={t('editor.redo')} on={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 size={16} /></Tb>
            <Sep />
            <Tb title={t('editor.paragraph')} active={editor.isActive('paragraph') && !editor.isActive('heading')} on={() => editor.chain().focus().setParagraph().run()}><Pilcrow size={16} /></Tb>
            <Tb title={t('editor.h1')} active={editor.isActive('heading', { level: 1 })} on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></Tb>
            <Tb title={t('editor.h2')} active={editor.isActive('heading', { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></Tb>
            <Tb title={t('editor.h3')} active={editor.isActive('heading', { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></Tb>
            <Sep />
            <Tb title={t('editor.bold')} active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></Tb>
            <Tb title={t('editor.italic')} active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></Tb>
            <Tb title={t('editor.strike')} active={editor.isActive('strike')} on={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></Tb>
            <Tb title={t('editor.code')} active={editor.isActive('code')} on={() => editor.chain().focus().toggleCode().run()}><Code size={16} /></Tb>
            <Tb title={t('editor.link')} active={editor.isActive('link')} on={setLink}><Link2 size={16} /></Tb>
            <Sep />
            <Tb title={t('editor.bulletList')} active={editor.isActive('bulletList')} on={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></Tb>
            <Tb title={t('editor.orderedList')} active={editor.isActive('orderedList')} on={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></Tb>
            <Tb title={t('editor.taskList')} active={editor.isActive('taskList')} on={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={16} /></Tb>
            <Tb title={t('editor.quote')} active={editor.isActive('blockquote')} on={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></Tb>
            <Tb title={t('editor.codeBlock')} active={editor.isActive('codeBlock')} on={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={16} /></Tb>
            <Tb title={t('editor.hr')} on={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={16} /></Tb>
            <Sep />
            <Tb title={t('editor.image')} disabled={uploading} on={() => pickFiles(imgInputRef)}><ImagePlus size={16} /></Tb>
            <Tb title={t('editor.attachment')} disabled={uploading} on={() => pickFiles(fileInputRef)}><Paperclip size={16} /></Tb>
            {uploading && <span className="ml-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Spinner /> {t('editor.uploading')}</span>}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[11px] text-accent">{t('editor.unsaved')}</span>}
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={save} disabled={saving} title={t('editor.saveHint')}>
            {saving ? <Spinner className="mr-1" /> : null}{t('editor.save')}
          </Button>
        </div>
      </div>

      {msg && (
        <div className={cn('px-4 py-2 text-sm', msg.kind === 'error' ? 'bg-destructive/15 text-destructive' : 'bg-secondary/40')}>
          {msg.text}
        </div>
      )}

      {mode === 'wysiwyg' && editor && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 120 }} className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-xl">
          <Tb title={t('editor.bold')} active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></Tb>
          <Tb title={t('editor.italic')} active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></Tb>
          <Tb title={t('editor.strike')} active={editor.isActive('strike')} on={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></Tb>
          <Tb title={t('editor.code')} active={editor.isActive('code')} on={() => editor.chain().focus().toggleCode().run()}><Code size={15} /></Tb>
          <Tb title={editor.isActive('link') ? t('editor.linkRemove') : t('editor.link')} active={editor.isActive('link')} on={setLink}>
            {editor.isActive('link') ? <Link2Off size={15} /> : <Link2 size={15} />}
          </Tb>
        </BubbleMenu>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'wysiwyg' ? (
          // edytujemy w kontekście bieżącego stylu wyświetlania (te same czcionki, kolory, szerokość kolumny)
          <div className={`doc-content docs-style-${docStyle} osnova-editor`}>
            <EditorContent editor={editor} />
          </div>
        ) : (
          <textarea
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setDirty(true) }}
            spellCheck={false}
            className="mx-auto block h-[60vh] w-full max-w-3xl resize-none rounded-md border border-input bg-background p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
        <span className="truncate font-mono">{path}</span>
        <span className="shrink-0 tabular-nums">{words} {t('editor.words')} · {text.length} {t('editor.chars')} · {t('editor.commitHint')}</span>
      </div>
    </div>
  )
}
