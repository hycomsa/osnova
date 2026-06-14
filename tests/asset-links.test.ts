import { describe, expect, it } from 'vitest'
import { editorUrl, toEditorMarkdown, toStorageMarkdown } from '@/lib/editor/asset-links'

const API = '/api/ws/1/file?view=client_business&path='
const DIR = '.ai/context/'

describe('asset-links (most względny ↔ URL API)', () => {
  it('editorUrl buduje URL z zakodowaną pełną ścieżką', () => {
    expect(editorUrl('.attachments/x.png', API, DIR)).toBe(`${API}${encodeURIComponent('.ai/context/.attachments/x.png')}`)
  })

  it('toEditorMarkdown zamienia względny src obrazka na URL API', () => {
    const md = '![diagram](.attachments/x.png)'
    const out = toEditorMarkdown(md, API, DIR)
    expect(out).toContain(`${API}${encodeURIComponent('.ai/context/.attachments/x.png')}`)
  })

  it('round-trip: editor → storage przywraca ścieżkę względną', () => {
    const storage = '![diagram](.attachments/x.png)'
    const editor = toEditorMarkdown(storage, API, DIR)
    expect(toStorageMarkdown(editor, API, DIR)).toBe(storage)
  })

  it('zewnętrzne i absolutne URL-e obrazków bez zmian', () => {
    const md = '![a](https://example.com/a.png)\n![b](/static/b.png)'
    expect(toEditorMarkdown(md, API, DIR)).toBe(md)
    expect(toStorageMarkdown(md, API, DIR)).toBe(md)
  })

  it('linki (nie-obrazki) pozostają nietknięte w obie strony', () => {
    const md = '[pobierz](.attachments/plik.pdf) oraz [doc](inny.md)'
    expect(toEditorMarkdown(md, API, DIR)).toBe(md)
    expect(toStorageMarkdown(md, API, DIR)).toBe(md)
  })

  it('docDir pusty (plik w roocie): round-trip działa', () => {
    const storage = '![x](.attachments/y.png)'
    const editor = toEditorMarkdown(storage, API, '')
    expect(editor).toContain(`${API}${encodeURIComponent('.attachments/y.png')}`)
    expect(toStorageMarkdown(editor, API, '')).toBe(storage)
  })
})
