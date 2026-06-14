import React from 'react'
import { ThemeProvider } from '@/components/theme-provider'
import { I18nProvider } from '@/i18n/client'
import { getLocale } from '@/i18n/server'
import './globals.css'
import './docs-themes.css'

export const metadata = {
  description: 'Osnova — git-native collaboration platform',
  title: 'Osnova',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  const locale = await getLocale()
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <I18nProvider locale={locale}>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
