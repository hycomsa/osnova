// Mostkowanie ścieżek zasobów między formą zapisu (markdown w repo — względne ścieżki)
// a formą wyświetlaną w edytorze WYSIWYG (URL do API pliku, żeby <img> się ładował).
//
// apiPrefix = `/api/ws/<id>/file?view=<view>&path=`
// docDir    = katalog dokumentu z końcowym `/` (np. `.ai/context/` lub `''` dla roota)

const IMG_RE = /(!\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g

function isExternal(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('/')
}

// pełny URL do API pliku dla względnej ścieżki `rel` w katalogu dokumentu
export function editorUrl(rel: string, apiPrefix: string, docDir: string): string {
  return `${apiPrefix}${encodeURIComponent(docDir + rel)}`
}

// markdown z repo → markdown dla edytora: względne `src` obrazków na URL API (podgląd)
export function toEditorMarkdown(md: string, apiPrefix: string, docDir: string): string {
  return md.replace(IMG_RE, (_m, open: string, src: string, title = '', close: string) => {
    if (isExternal(src)) return `${open}${src}${title}${close}`
    return `${open}${editorUrl(src, apiPrefix, docDir)}${title}${close}`
  })
}

// markdown z edytora → markdown do zapisu: URL API z powrotem na ścieżkę względną
export function toStorageMarkdown(md: string, apiPrefix: string, docDir: string): string {
  return md.replace(IMG_RE, (_m, open: string, src: string, title = '', close: string) => {
    if (!src.startsWith(apiPrefix)) return `${open}${src}${title}${close}`
    let full: string
    try {
      full = decodeURIComponent(src.slice(apiPrefix.length))
    } catch {
      return `${open}${src}${title}${close}`
    }
    const rel = docDir && full.startsWith(docDir) ? full.slice(docDir.length) : full
    return `${open}${rel}${title}${close}`
  })
}
