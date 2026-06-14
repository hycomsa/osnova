import type { Payload } from 'payload'
import { normalizeLocale, type Locale } from '../../i18n/config'
import { messages } from '../../i18n/messages'

// Zbiorcze podsumowania e-mail nieprzeczytanych powiadomień.
// Renderer jest czysty (testowalny); kolekcja danych odpytuje Payload.

export interface DigestItem {
  type: string
  actorName?: string | null
  actorEmail?: string | null
  path?: string | null
  view?: string | null
  workspaceName?: string | null
  workspaceSlug?: string | null
  excerpt?: string | null
  createdAt?: string | null
}

export interface DigestEmail {
  subject: string
  html: string
  text: string
}

export interface UserDigest {
  userId: string | number
  email: string
  name?: string | null
  locale: Locale
  items: DigestItem[]
}

function tr(locale: Locale, key: string): string {
  const parts = key.split('.')
  let cur: unknown = (messages[locale] ?? messages.pl).translation
  for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p]
  return typeof cur === 'string' ? cur : key
}

function verbKey(type: string): string {
  switch (type) {
    case 'reply': return 'notifications.replied'
    case 'approval_approved': return 'notifications.approved'
    case 'approval_changes': return 'notifications.changesRequested'
    case 'approval': return 'notifications.approvalFallback'
    default: return 'notifications.mentioned'
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function itemUrl(appUrl: string, it: DigestItem): string | null {
  if (!it.workspaceSlug || !it.path) return null
  const p = it.path.split('/').map(encodeURIComponent).join('/')
  const view = it.view ? `?view=${encodeURIComponent(it.view)}` : ''
  return `${appUrl.replace(/\/$/, '')}/ws/${encodeURIComponent(it.workspaceSlug)}/${p}${view}`
}

export function renderDigestEmail(items: DigestItem[], localeInput: string | null | undefined, appUrl: string): DigestEmail {
  const locale = normalizeLocale(localeInput)
  const count = items.length
  const subject = count === 1
    ? tr(locale, 'notifications.digestSubjectOne')
    : tr(locale, 'notifications.digestSubjectMany').replace('{{count}}', String(count))
  const intro = tr(locale, 'notifications.digestIntro')
  const footer = tr(locale, 'notifications.digestFooter')
  const cta = tr(locale, 'notifications.digestViewAll')
  const inboxUrl = `${appUrl.replace(/\/$/, '')}/notifications`

  const rows = items.map((it) => {
    const actor = esc(it.actorName || it.actorEmail || 'Osnova')
    const verb = esc(tr(locale, verbKey(it.type)))
    const where = it.path ? esc([it.workspaceName, it.path.split('/').pop()].filter(Boolean).join(' · ')) : ''
    const excerpt = it.type !== 'approval' && it.type !== 'approval_approved' && it.excerpt ? `<div style="color:#64748b;font-size:13px;margin-top:2px">„${esc(it.excerpt)}"</div>` : ''
    const url = itemUrl(appUrl, it)
    const line = `<strong>${actor}</strong> ${verb}`
    const body = url ? `<a href="${url}" style="color:#0f172a;text-decoration:none">${line}</a>` : line
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0">${body}${where ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px">${where}</div>` : ''}${excerpt}</td></tr>`
  }).join('')

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0f172a;padding:18px 24px"><span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.01em">Osnova</span></td></tr>
<tr><td style="padding:24px"><p style="margin:0 0 12px;color:#0f172a;font-size:15px">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<div style="margin-top:24px"><a href="${inboxUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">${esc(cta)} →</a></div>
</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0"><p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5">${esc(footer)}</p></td></tr>
</table></td></tr></table></body></html>`

  const textLines = items.map((it) => {
    const actor = it.actorName || it.actorEmail || 'Osnova'
    const verb = tr(locale, verbKey(it.type))
    const where = it.path ? ` (${[it.workspaceName, it.path.split('/').pop()].filter(Boolean).join(' · ')})` : ''
    const url = itemUrl(appUrl, it)
    return `- ${actor} ${verb}${where}${url ? `\n  ${url}` : ''}`
  })
  const text = `${intro}\n\n${textLines.join('\n')}\n\n${cta}: ${inboxUrl}\n\n${footer}`

  return { subject, html, text }
}

// Zbiera nieprzeczytane powiadomienia per użytkownik dla użytkowników z włączonymi podsumowaniami.
// frequency: które ustawienia digestu uwzględnić (np. ['daily'] albo ['daily','weekly']).
export async function collectDigests(payload: Payload, frequency: string[] = ['daily', 'weekly']): Promise<UserDigest[]> {
  const users = await payload.find({
    collection: 'users',
    where: { emailDigest: { in: frequency } },
    limit: 1000,
    overrideAccess: true,
  })
  const out: UserDigest[] = []
  for (const u of users.docs as any[]) {
    if (!u.email) continue
    const notifs = await payload.find({
      collection: 'notifications',
      where: { and: [{ recipient: { equals: u.id } }, { read: { equals: false } }] },
      sort: '-createdAt',
      depth: 1,
      limit: 50,
      overrideAccess: true,
    })
    if (notifs.docs.length === 0) continue
    const items: DigestItem[] = (notifs.docs as any[]).map((n) => ({
      type: n.type,
      actorName: n.actorName,
      actorEmail: n.actorEmail,
      path: n.path,
      view: n.view,
      workspaceName: n.workspace && typeof n.workspace === 'object' ? n.workspace.name : null,
      workspaceSlug: n.workspace && typeof n.workspace === 'object' ? n.workspace.slug : null,
      excerpt: n.excerpt,
      createdAt: n.createdAt,
    }))
    out.push({ userId: u.id, email: u.email, name: u.name, locale: normalizeLocale(u.locale), items })
  }
  return out
}
