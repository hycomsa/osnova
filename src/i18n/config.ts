export const LOCALES = ['pl', 'en', 'de'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'pl'
export const LOCALE_COOKIE = 'osnova_locale'

export const LOCALE_LABEL: Record<Locale, string> = { pl: 'Polski', en: 'English', de: 'Deutsch' }
export const LOCALE_SHORT: Record<Locale, string> = { pl: 'PL', en: 'EN', de: 'DE' }
// flagi krajów (emoji) dla przełącznika języka
export const LOCALE_FLAG: Record<Locale, string> = { pl: '🇵🇱', en: '🇬🇧', de: '🇩🇪' }

export function normalizeLocale(v?: string | null): Locale {
  return (LOCALES as readonly string[]).includes(v ?? '') ? (v as Locale) : DEFAULT_LOCALE
}
