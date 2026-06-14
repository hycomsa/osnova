import { describe, expect, it } from 'vitest'
import { renderDigestEmail, type DigestItem } from '../src/lib/notifications/digest'

const APP = 'https://osnova.example.com'

function items(): DigestItem[] {
  return [
    { type: 'mention', actorName: 'Ada Kowalska', path: 'wymagania/APP/login.md', view: 'client_business', workspaceName: 'AI SDLC', workspaceSlug: 'ai-sdlc-test', excerpt: 'spójrz tu', createdAt: '2026-06-12T10:00:00Z' },
    { type: 'approval_approved', actorName: 'Jan Nowak', path: 'wymagania/APP/login.md', view: 'direct', workspaceName: 'AI SDLC', workspaceSlug: 'ai-sdlc-test', createdAt: '2026-06-12T11:00:00Z' },
  ]
}

describe('renderDigestEmail', () => {
  it('builds a localized subject with the count (PL)', () => {
    const r = renderDigestEmail(items(), 'pl', APP)
    expect(r.subject).toContain('2')
    expect(r.subject.toLowerCase()).toContain('osnova')
  })

  it('uses the singular subject for exactly one item', () => {
    const r = renderDigestEmail([items()[0]], 'pl', APP)
    expect(r.subject).not.toContain('{{count}}')
    expect(r.subject).toContain('1')
  })

  it('localizes verbs by locale', () => {
    const pl = renderDigestEmail(items(), 'pl', APP)
    const en = renderDigestEmail(items(), 'en', APP)
    const de = renderDigestEmail(items(), 'de', APP)
    expect(pl.text).toContain('wspomniał')
    expect(en.text).toContain('mentioned you')
    expect(de.text).toContain('erwähnt')
  })

  it('builds absolute deep links to documents', () => {
    const r = renderDigestEmail(items(), 'en', APP)
    expect(r.html).toContain(`${APP}/ws/ai-sdlc-test/wymagania/APP/login.md?view=client_business`)
    expect(r.html).toContain(`${APP}/notifications`)
  })

  it('falls back to default locale for unknown locale input', () => {
    const r = renderDigestEmail(items(), 'xx', APP)
    expect(r.subject).toContain('Osnova')
    // PL is the default locale → Polish verb
    expect(r.text).toContain('wspomniał')
  })

  it('escapes HTML in actor names and excerpts', () => {
    const r = renderDigestEmail([{ type: 'mention', actorName: '<script>x</script>', path: 'a/b.md', workspaceSlug: 'w', workspaceName: 'W', excerpt: 'a & b', createdAt: '2026-06-12T10:00:00Z' }], 'en', APP)
    expect(r.html).not.toContain('<script>x</script>')
    expect(r.html).toContain('&lt;script&gt;')
    expect(r.html).toContain('a &amp; b')
  })

  it('omits excerpt line for approval_approved but keeps it for mentions', () => {
    const r = renderDigestEmail(items(), 'en', APP)
    // excerpt "spójrz tu" present (mention), approval has no excerpt anyway
    expect(r.html).toContain('spójrz tu')
  })
})
