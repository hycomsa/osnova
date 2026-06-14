import { describe, expect, it } from 'vitest'
import { extractFrontmatter, renderMarkdown, renderMetadataTable } from '@/lib/markdown/render'

describe('frontmatter / metadane', () => {
  it('oddziela metadane (frontmatter) od treści', () => {
    const { meta, body } = extractFrontmatter('---\nauthor: Jan\nsha256: abc123\n---\n# Tytuł\n\ntreść')
    expect(meta).toEqual({ author: 'Jan', sha256: 'abc123' })
    expect(body.startsWith('# Tytuł')).toBe(true)
  })
  it('brak frontmatter → meta null, treść bez zmian', () => {
    const { meta, body } = extractFrontmatter('# Tytuł')
    expect(meta).toBe(null)
    expect(body).toBe('# Tytuł')
  })
  it('renderMetadataTable buduje tabelę .doc-frontmatter', () => {
    const html = renderMetadataTable({ author: 'Jan', last_synced: '2026-06-13' })
    expect(html).toContain('doc-frontmatter')
    expect(html).toContain('author')
    expect(html).toContain('Jan')
  })
})

const BASE = '/api/ws/1/file?view=client_business&path='

describe('renderMarkdown', () => {
  it('renderuje GFM (nagłówek + tabela)', async () => {
    const html = await renderMarkdown('# Tytuł\n\n| a | b |\n|---|---|\n| 1 | 2 |', { assetBase: BASE })
    expect(html).toContain('<h1 id="tytuł">Tytuł</h1>')
    expect(html).toContain('<table>')
  })
  it('tabela owinięta w przewijalny kontener .doc-table-wrap', async () => {
    const html = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |', { assetBase: BASE })
    expect(html).toContain('doc-table-wrap')
    expect(html).toMatch(/doc-table-wrap[^>]*>\s*<table>/)
  })
  it('callout [!WARNING] dostaje klasę', async () => {
    const html = await renderMarkdown('> [!WARNING] Uważaj\n> druga linia', { assetBase: BASE })
    expect(html).toContain('callout-warning')
    expect(html).not.toContain('[!WARNING]')
  })
  it('callout składany [!NOTE]- → <details> (zwinięty) z <summary>', async () => {
    const html = await renderMarkdown('> [!NOTE]- Szczegóły\n>\n> ukryta treść', { assetBase: BASE })
    expect(html).toContain('<details')
    expect(html).toContain('callout-foldable')
    expect(html).toContain('<summary>Szczegóły</summary>')
    expect(html).not.toContain('open') // zwinięty domyślnie
    expect(html).toContain('ukryta treść')
  })
  it('callout składany [!TIP]+ → <details open> (rozwinięty)', async () => {
    const html = await renderMarkdown('> [!TIP]+ Wskazówka\n>\n> treść', { assetBase: BASE })
    expect(html).toMatch(/<details[^>]*\sopen/)
    expect(html).toContain('callout-tip')
  })
  it('callout składany bez tytułu → nazwa typu w summary', async () => {
    const html = await renderMarkdown('> [!WARNING]-\n>\n> uwaga', { assetBase: BASE })
    expect(html).toContain('<summary>Warning</summary>')
  })
  it('zwykły callout [!NOTE] pozostaje <blockquote>, nie <details>', async () => {
    const html = await renderMarkdown('> [!NOTE] zwykły', { assetBase: BASE })
    expect(html).toContain('callout-note')
    expect(html).not.toContain('<details')
  })
  it('blok mermaid dostaje klasę "mermaid"', async () => {
    const html = await renderMarkdown('```mermaid\ngraph TD; A-->B;\n```', { assetBase: BASE })
    expect(html).toContain('class="mermaid"')
    expect(html).toContain('graph TD')
  })
  it('relatywny obraz przepisany na assetBase', async () => {
    const html = await renderMarkdown('![alt](img/logo.png)', { assetBase: BASE })
    // rehype escapuje & w atrybucie jako &#x26; (prawidłowy HTML) — sprawdzamy części URL
    expect(html).toContain('/api/ws/1/file?view=')
    expect(html).toContain('view=client_business')
    expect(html).toContain('path=img%2Flogo.png')
  })
  it('zewnętrzny i absolutny obraz nietknięte', async () => {
    const html = await renderMarkdown('![a](https://x.pl/i.png) ![b](/local.png)', { assetBase: BASE })
    expect(html).toContain('src="https://x.pl/i.png"')
    expect(html).toContain('src="/local.png"')
  })
})

describe('osadzanie PDF', () => {
  it('składnia obrazka wskazująca na względny PDF → iframe osadzony', async () => {
    const html = await renderMarkdown('![Umowa](.attachments/umowa.pdf)', { assetBase: BASE })
    expect(html).toContain('class="pdf-embed"')
    expect(html).toContain('<iframe')
    expect(html).toContain('path=.attachments%2Fumowa.pdf')
    expect(html).not.toContain('<img')
    // podpis z tekstu alt + link „otwórz"
    expect(html).toContain('Umowa')
    expect(html).toContain('pdf-embed-open')
  })
  it('zewnętrzny PDF w składni obrazka osadzony bez przepisywania URL', async () => {
    const html = await renderMarkdown('![raport](https://example.com/r.pdf)', { assetBase: BASE })
    expect(html).toContain('class="pdf-embed"')
    expect(html).toContain('https://example.com/r.pdf')
  })
  it('link (składnia [..]) do PDF pozostaje linkiem do pobrania, nie osadza', async () => {
    const html = await renderMarkdown('[Specyfikacja](.attachments/spec.pdf)', { assetBase: BASE })
    expect(html).not.toContain('pdf-embed')
    expect(html).toContain('<a')
    expect(html).toContain('path=.attachments%2Fspec.pdf')
  })
  it('bez podpisu używa nazwy pliku PDF', async () => {
    const html = await renderMarkdown('![](docs/Plan%20A.pdf)', { assetBase: BASE })
    expect(html).toContain('pdf-embed')
    expect(html).toContain('Plan A.pdf')
  })
  it('link do nie-PDF (np. .docx) pozostaje linkiem do pobrania', async () => {
    const html = await renderMarkdown('[plik](.attachments/raport.docx)', { assetBase: BASE })
    expect(html).not.toContain('pdf-embed')
    expect(html).toContain('<a')
    expect(html).toContain('path=.attachments%2Fraport.docx')
  })
})
