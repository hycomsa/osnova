// Daty/czasy zależne od języka (Intl). nowLabel — przetłumaczone „teraz".
export function relativeTime(iso: string | undefined | null, locale: string, nowLabel: string): string {
  if (!iso) return ''
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return ''
  const diffSec = Math.round((ts - Date.now()) / 1000) // ujemne dla przeszłości
  if (Math.abs(diffSec) < 60) return nowLabel
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
  const mins = Math.round(diffSec / 60)
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute')
  const hours = Math.round(diffSec / 3600)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  const days = Math.round(diffSec / 86400)
  if (Math.abs(days) < 30) return rtf.format(days, 'day')
  return new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function dateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return ''
  const ts = Date.parse(iso)
  return Number.isNaN(ts) ? '' : new Date(ts).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
