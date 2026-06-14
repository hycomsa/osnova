'use client'

import i18next from 'i18next'
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useState } from 'react'
import { DEFAULT_LOCALE, LOCALES, LOCALE_FLAG, LOCALE_LABEL, LOCALE_SHORT, type Locale } from './config'
import { messages } from './messages'

// Świeża instancja i18next per mount (na serwerze = per request → brak wycieku locale między żądaniami)
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [i18n] = useState(() => {
    const inst = i18next.createInstance()
    inst.use(initReactI18next).init({
      resources: messages,
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    return inst
  })
  useEffect(() => { if (i18n.language !== locale) void i18n.changeLanguage(locale) }, [i18n, locale])
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}

export { useTranslation }

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation()
  const router = useRouter()
  const current = (i18n.language as Locale) || DEFAULT_LOCALE
  const pick = async (l: Locale) => {
    if (l === current) return
    await i18n.changeLanguage(l)
    try { await fetch('/api/locale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: l }) }) } catch { /* ignore */ }
    router.refresh()
  }
  return (
    <div className={`flex gap-1 ${compact ? '' : 'rounded-lg bg-secondary/50 p-0.5'}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => pick(l)}
          title={LOCALE_LABEL[l]}
          aria-label={LOCALE_LABEL[l]}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${current === l ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <span className="text-sm leading-none" aria-hidden>{LOCALE_FLAG[l]}</span>
          {LOCALE_SHORT[l]}
        </button>
      ))}
    </div>
  )
}
