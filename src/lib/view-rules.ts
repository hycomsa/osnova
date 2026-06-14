import { parse } from 'yaml'
import type { ViewName } from './roles'

export interface ViewRules {
  include: string[]
  exclude: string[]
}

export type RulesSource = 'docsconfig' | 'osnova' | 'hybrid'

export interface ViewConfigEntry extends Partial<ViewRules> {
  hide_underscored?: boolean
}

export interface DocsConfig {
  views?: Partial<Record<ViewName, ViewConfigEntry>>
}

export const EMPTY_RULES: ViewRules = { include: [], exclude: [] }
export const FULL_RULES: ViewRules = { include: ['**'], exclude: [] }

// wyklucza katalogi zaczynające się od „_" (np. _input) oraz pliki mające taki katalog w ścieżce
export const UNDERSCORE_EXCLUDES = ['_*/**', '**/_*/**']

export function parseDocsConfig(yamlText: string): DocsConfig {
  try {
    const data = parse(yamlText)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return data as DocsConfig
  } catch {
    return {}
  }
}

function normalize(rules?: Partial<ViewRules> | null): ViewRules | null {
  if (!rules) return null
  const include = Array.isArray(rules.include) ? rules.include.filter((s) => typeof s === 'string') : []
  const exclude = Array.isArray(rules.exclude) ? rules.exclude.filter((s) => typeof s === 'string') : []
  if (include.length === 0 && exclude.length === 0) return null
  return { include, exclude }
}

export function resolveViewRules(opts: {
  view: ViewName
  docsConfig?: DocsConfig | null
  override?: Partial<ViewRules> | null
  source?: RulesSource
  hideUnderscored?: boolean | null
}): ViewRules {
  const { view, docsConfig, override, source = 'hybrid', hideUnderscored } = opts
  const isDirect = view === 'direct'

  const fromFile = normalize(docsConfig?.views?.[view])
  const fromOsnova = normalize(override)
  // direct (pełny 1:1) jest domyślnie najbardziej permisywny; widoki klienckie — fail-closed
  const fallback = isDirect ? FULL_RULES : EMPTY_RULES

  let base: ViewRules
  if (source === 'osnova') base = fromOsnova ?? fallback
  else if (source === 'docsconfig') base = fromFile ?? fallback
  else base = fromOsnova ?? fromFile ?? fallback

  // ukrywanie katalogów „_" — konfigurowalne; domyślnie włączone dla widoków klienckich, wyłączone dla directego
  const hide = hideUnderscored ?? docsConfig?.views?.[view]?.hide_underscored ?? !isDirect
  if (hide && base.include.length > 0) {
    return { include: base.include, exclude: [...base.exclude, ...UNDERSCORE_EXCLUDES] }
  }
  return base
}
