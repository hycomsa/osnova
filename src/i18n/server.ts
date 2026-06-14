import { cookies } from 'next/headers'
import { LOCALE_COOKIE, normalizeLocale, type Locale } from './config'
import { messages } from './messages'

export async function getLocale(): Promise<Locale> {
  const c = await cookies()
  return normalizeLocale(c.get(LOCALE_COOKIE)?.value)
}

// Tłumaczenie po stronie serwera (np. splash) — rozwiązuje klucz „a.b.c".
export function st(locale: Locale, key: string): string {
  const parts = key.split('.')
  let cur: unknown = (messages[locale] ?? messages.pl).translation
  for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p]
  return typeof cur === 'string' ? cur : key
}
