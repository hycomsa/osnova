import nodemailer, { type Transporter } from 'nodemailer'

// Transport SMTP konfigurowany ze zmiennych środowiskowych.
// Obsługiwane: SMTP_URL (np. smtp://user:pass@host:587) albo SMTP_HOST/PORT/USER/PASS/SECURE.
// Bez konfiguracji mailer działa w trybie no-op (loguje i pomija) — nie blokuje pozostałej logiki.

export interface MailMessage {
  to: string
  subject: string
  html: string
  text?: string
}

export interface SendResult {
  ok: boolean
  skipped?: boolean
  messageId?: string
  error?: string
}

let cached: Transporter | null | undefined

export function mailFrom(): string {
  return process.env.MAIL_FROM || 'Osnova <no-reply@osnova.local>'
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL || process.env.SMTP_HOST)
}

function getTransport(): Transporter | null {
  if (cached !== undefined) return cached
  if (process.env.SMTP_URL) {
    cached = nodemailer.createTransport(process.env.SMTP_URL)
  } else if (process.env.SMTP_HOST) {
    cached = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    })
  } else {
    cached = null
  }
  return cached
}

export async function sendMail(msg: MailMessage): Promise<SendResult> {
  const tx = getTransport()
  if (!tx) {
    console.warn(`[mailer] SMTP nieskonfigurowany — pomijam e-mail do ${msg.to} („${msg.subject}")`)
    return { ok: false, skipped: true }
  }
  try {
    const info = await tx.sendMail({ from: mailFrom(), to: msg.to, subject: msg.subject, html: msg.html, text: msg.text })
    return { ok: true, messageId: info.messageId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
