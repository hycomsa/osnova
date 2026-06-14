import picomatch from 'picomatch'
import type { ViewRules } from './view-rules'

function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/^\//, '')
}

export function isPathAllowed(path: string, rules: ViewRules): boolean {
  const p = normalizePath(path)
  if (p.length === 0) return false
  if (p.split('/').includes('..')) return false
  if (rules.include.length === 0) return false

  // dot:true — treść często żyje pod katalogami z kropką (np. .ai/context); '**' musi je obejmować
  const isIncluded = picomatch(rules.include, { dot: true })
  if (!isIncluded(p)) return false

  if (rules.exclude.length > 0) {
    const isExcluded = picomatch(rules.exclude, { dot: true })
    if (isExcluded(p)) return false
  }
  return true
}

export function filterTree(paths: string[], rules: ViewRules): string[] {
  return paths.filter((p) => isPathAllowed(p, rules))
}

// ścieżka jest osadzonym załącznikiem strony (katalog `.attachments`)
export function isAttachmentPath(p: string): boolean {
  return normalizePath(p).split('/').includes('.attachments')
}

// Widoczność do ODCZYTU/SERWOWANIA. Załącznik (`<dir>/.attachments/<plik>`) dziedziczy
// widoczność katalogu dokumentu: jest czytelny, gdy nie jest wykluczony oraz albo objęty
// include (sekcje z `/**`), albo katalog `<dir>` ma w include bezpośrednio dołączony plik
// (przypadek dokumentów w roocie, np. README.md). Zwykłe pliki: jak isPathAllowed.
export function isReadable(path: string, rules: ViewRules): boolean {
  const p = normalizePath(path)
  if (isPathAllowed(p, rules)) return true
  if (!isAttachmentPath(p)) return false
  if (rules.exclude.length > 0 && picomatch(rules.exclude, { dot: true })(p)) return false
  const i = p.indexOf('/.attachments/')
  const dir = i >= 0 ? p.slice(0, i) : ''
  const prefix = dir ? `${dir}/` : ''
  // istnieje include będący bezpośrednim plikiem w `dir` (bez globów i bez zagłębienia)
  return rules.include.some((g) => !/[*?{}[\]]/.test(g) && g.startsWith(prefix) && !g.slice(prefix.length).includes('/'))
}
