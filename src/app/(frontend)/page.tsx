import { headers as nextHeaders } from 'next/headers'
import config from '@payload-config'
import { getPayload } from 'payload'
import { AppHeader } from '@/components/app-header'
import { OsnovaMark } from '@/components/osnova-mark'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { authMode } from '@/lib/auth/mode'
import { LanguageSwitcher } from '@/i18n/client'
import { getLocale, st } from '@/i18n/server'
import { WorkspaceBrowser } from './components/WorkspaceBrowser'

export default async function Home() {
  const payload = await getPayload({ config })
  const headers = await nextHeaders()
  const { user } = await payload.auth({ headers })
  const locale = await getLocale()
  const t = (k: string) => st(locale, k)

  // Zalogowany: pełnoekranowy pulpit z siatką workspace’ów (nie wąska karta).
  if (user) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t('home.title')}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('home.subtitle')}</p>
            </div>
            <div className="w-44"><LanguageSwitcher /></div>
          </div>
          <WorkspaceBrowser />
        </main>
      </div>
    )
  }

  // Niezalogowany: ekran logowania (rozmyte tło zaciera wmontowany w grafikę logotyp).
  return (
    <main className="osnova-bg relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/osnova-splash4.png)', filter: 'blur(22px)', transform: 'scale(1.18)' }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-background/75" />
      <Card className="relative w-full max-w-md bg-card/85 backdrop-blur">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <OsnovaMark size={56} />
          <div>
            <h1 className="text-3xl font-light tracking-[0.3em]">osnova</h1>
            <p className="text-sm text-muted-foreground">{t('home.tagline')}</p>
          </div>
          {authMode() === 'oidc' ? (
            <Button asChild size="lg" className="mt-2">
              <a href="/api/auth/login">{t('auth.login')}</a>
            </Button>
          ) : (
            <div className="mt-2 space-y-1">
              <p className="text-sm font-medium">{t('auth.notAuthenticated')}</p>
              <p className="text-xs text-muted-foreground">{t('auth.contactAdmin')}</p>
            </div>
          )}
          <div className="mt-1 w-40">
            <LanguageSwitcher />
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
