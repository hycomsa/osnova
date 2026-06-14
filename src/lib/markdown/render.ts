import { parse as parseYaml } from 'yaml'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

// Callouty/admonicje; opcjonalny znak składania (Obsidian): `-` = zwinięty, `+` = rozwinięty.
const CALLOUT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([+-]?)\s*/

function remarkCallouts() {
  return (tree: any) => {
    visit(tree, 'blockquote', (node: any) => {
      const firstParagraph = node.children?.[0]
      const firstText = firstParagraph?.children?.[0]
      if (firstText?.type !== 'text') return
      const match = CALLOUT_RE.exec(firstText.value)
      if (!match) return
      const type = match[1].toLowerCase()
      const fold = match[2] // '' | '+' | '-'
      firstText.value = firstText.value.replace(CALLOUT_RE, '')
      node.data = node.data ?? {}
      if (fold === '+' || fold === '-') {
        // Składany blok → <details>/<summary>. Tytuł = reszta pierwszej linii (lub nazwa typu);
        // treść w kolejnych akapitach (wymaga pustej linii po tytule, jak w Obsidianie).
        const hasTitle = firstText.value.trim().length > 0 || (firstParagraph.children?.length ?? 0) > 1
        if (!hasTitle) firstText.value = type.charAt(0).toUpperCase() + type.slice(1)
        node.data.hName = 'details'
        node.data.hProperties = {
          className: ['callout', 'callout-foldable', `callout-${type}`],
          ...(fold === '+' ? { open: true } : {}),
        }
        firstParagraph.data = { ...(firstParagraph.data ?? {}), hName: 'summary' }
      } else {
        node.data.hProperties = { className: ['callout', `callout-${type}`] }
      }
    })
  }
}

// Buduje dzieci kontenera osadzonego PDF (iframe + pasek z nazwą i linkiem „otwórz").
function pdfEmbedChildren(url: string, alt: string) {
  return [
    { type: 'element', tagName: 'iframe', properties: { src: url, className: ['pdf-embed-frame'], title: alt, loading: 'lazy' }, children: [] },
    { type: 'element', tagName: 'div', properties: { className: ['pdf-embed-bar'] }, children: [
      { type: 'element', tagName: 'span', properties: { className: ['pdf-embed-name'] }, children: [{ type: 'text', value: alt }] },
      { type: 'element', tagName: 'a', properties: { href: url, target: '_blank', rel: ['noopener', 'noreferrer'], className: ['pdf-embed-open'] }, children: [{ type: 'text', value: '↗' }] },
    ] },
  ]
}

function fileNameFrom(ref: string): string {
  try { return decodeURIComponent(ref.split(/[?#]/)[0].split('/').pop() || 'PDF') } catch { return 'PDF' }
}

// Owijamy tabele w przewijalny kontener, by szerokie tabele mogły wyjść poza miarę tekstu
// (i przewijać się poziomo zamiast ściskać kolumny). CSS: .doc-table-wrap.
function rehypeWrapTables() {
  return (tree: any) => {
    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (node.tagName !== 'table' || !parent || index == null) return
      if (parent.tagName === 'div' && (parent.properties?.className as string[] | undefined)?.includes('doc-table-wrap')) return
      parent.children[index] = {
        type: 'element', tagName: 'div', properties: { className: ['doc-table-wrap'] }, children: [node],
      }
    })
  }
}

function rehypeMermaidAndImages(opts: { assetBase: string }) {
  return (tree: any) => {
    visit(tree, 'element', (node: any) => {
      if (
        node.tagName === 'code' &&
        Array.isArray(node.properties?.className) &&
        node.properties.className.includes('language-mermaid')
      ) {
        node.properties.className = ['mermaid']
      }
      if (node.tagName === 'img' && typeof node.properties?.src === 'string') {
        const src: string = node.properties.src
        const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')
        const isAbsolute = src.startsWith('/')
        const url = !isExternal && !isAbsolute ? `${opts.assetBase}${encodeURIComponent(src)}` : src
        // Składnia obrazka wskazująca na PDF → osadzony podgląd PDF (iframe), nie <img>.
        if (/\.pdf(\?|#|$)/i.test(src)) {
          const alt = typeof node.properties.alt === 'string' && node.properties.alt.trim() ? node.properties.alt.trim() : fileNameFrom(src)
          node.tagName = 'div'
          node.properties = { className: ['pdf-embed'] }
          node.children = pdfEmbedChildren(url, alt)
          return
        }
        if (!isExternal && !isAbsolute) {
          node.properties.src = url
        }
      }
      // względne linki do plików-załączników (nie-markdown, nie-kotwica) → pobieralne przez API.
      // Uwaga: link do PDF pozostaje linkiem do pobrania; osadzanie PDF używa składni obrazka ![](x.pdf).
      if (node.tagName === 'a' && typeof node.properties?.href === 'string') {
        const href: string = node.properties.href
        const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')
        const isAbsolute = href.startsWith('/')
        const isAnchor = href.startsWith('#')
        const isMarkdown = /\.(md|markdown)(#.*)?$/i.test(href)
        const hasExt = /\.[a-z0-9]{1,8}(#.*)?$/i.test(href)
        if (!isExternal && !isAbsolute && !isAnchor && !isMarkdown && hasExt) {
          node.properties.href = `${opts.assetBase}${encodeURIComponent(href)}`
        }
      }
    })
  }
}

const FRONTMATTER_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/

// Oddziela blok metadanych (YAML frontmatter) od treści dokumentu.
export function extractFrontmatter(md: string): { meta: Record<string, unknown> | null; body: string } {
  const m = FRONTMATTER_RE.exec(md)
  if (!m) return { meta: null, body: md }
  let meta: Record<string, unknown> | null = null
  try {
    const d = parseYaml(m[1])
    meta = d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : null
  } catch {
    meta = null
  }
  return { meta, body: md.slice(m[0].length) }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Renderuje metadane jako czytelną tabelę (gdy widok ma włączone pokazywanie metadanych).
export function renderMetadataTable(meta: Record<string, unknown>): string {
  const rows = Object.entries(meta)
    .map(([k, v]) => {
      const val = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
      return `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(val)}</td></tr>`
    })
    .join('')
  return rows ? `<table class="doc-frontmatter"><tbody>${rows}</tbody></table>` : ''
}

export async function renderMarkdown(md: string, opts: { assetBase: string }): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCallouts)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeMermaidAndImages, opts)
    .use(rehypeWrapTables)
    .use(rehypeStringify)
    .process(md)
  return String(file)
}
