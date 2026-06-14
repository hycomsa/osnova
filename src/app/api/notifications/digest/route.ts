import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { collectDigests, renderDigestEmail } from '@/lib/notifications/digest'
import { isMailConfigured, sendMail } from '@/lib/mail/mailer'

// POST /api/notifications/digest — wysyła zbiorcze podsumowania e-mail.
// Autoryzacja: nagłówek x-cron-secret === CRON_SECRET (dla schedulera) lub zalogowany system_admin.
// Parametry (query): dryRun=1 (nie wysyła, nie zapisuje), frequency=daily,weekly (domyślnie obie).
export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })

  const secret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  let authorized = Boolean(secret && headerSecret && headerSecret === secret)
  if (!authorized) {
    const user = await getRequestUser(req, payload)
    authorized = Boolean(user && ((user as any).globalRoles as string[] | undefined)?.includes('system_admin'))
  }
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const freqParam = url.searchParams.get('frequency')
  const frequency = freqParam ? freqParam.split(',').map((s) => s.trim()).filter(Boolean) : ['daily', 'weekly']
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const digests = await collectDigests(payload, frequency)
  const results: Array<{ email: string; items: number; sent: boolean; skipped?: boolean; error?: string }> = []

  for (const d of digests) {
    const mail = renderDigestEmail(d.items, d.locale, appUrl)
    if (dryRun) {
      results.push({ email: d.email, items: d.items.length, sent: false, skipped: true })
      continue
    }
    const r = await sendMail({ to: d.email, subject: mail.subject, html: mail.html, text: mail.text })
    if (r.ok) {
      const nowIso = new Date().toISOString()
      await payload.update({ collection: 'users', id: d.userId, data: { lastDigestAt: nowIso } as any, overrideAccess: true }).catch(() => {})
    }
    results.push({ email: d.email, items: d.items.length, sent: r.ok, skipped: r.skipped, error: r.error })
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    mailConfigured: isMailConfigured(),
    recipients: digests.length,
    notifications: digests.reduce((a, d) => a + d.items.length, 0),
    results,
  })
}
