import { describe, expect, it } from 'vitest'
import { computeAnchor, matchAnchor } from '@/lib/comments/anchor'

const TEXT = 'Wprowadzenie do systemu. Klient akceptuje specyfikację funkcjonalną. Koniec.'

describe('anchor', () => {
  it('compute → match na tym samym tekście', () => {
    const start = TEXT.indexOf('specyfikację')
    const a = computeAnchor(TEXT, start, start + 'specyfikację'.length)
    expect(a.quote).toBe('specyfikację')
    const m = matchAnchor(TEXT, a)
    expect(m).toEqual({ index: start, length: 'specyfikację'.length })
  })

  it('wstawienie tekstu przed → kotwica wciąż znaleziona (przesunięta)', () => {
    const start = TEXT.indexOf('specyfikację')
    const a = computeAnchor(TEXT, start, start + 'specyfikację'.length)
    const text2 = 'DOPISANY AKAPIT NA POCZĄTKU. ' + TEXT
    const m = matchAnchor(text2, a)
    expect(m).not.toBeNull()
    expect(text2.slice(m!.index, m!.index + m!.length)).toBe('specyfikację')
  })

  it('duplikat cytatu — kontekst rozróżnia wystąpienie', () => {
    const text = 'punkt A: zatwierdź. inny akapit. punkt B: zatwierdź. koniec.'
    const second = text.lastIndexOf('zatwierdź')
    const a = computeAnchor(text, second, second + 'zatwierdź'.length)
    const m = matchAnchor(text, a)
    expect(m!.index).toBe(second)
  })

  it('cytat usunięty → null (osierocony)', () => {
    const start = TEXT.indexOf('specyfikację')
    const a = computeAnchor(TEXT, start, start + 'specyfikację'.length)
    const text2 = 'Zupełnie inna treść bez tego słowa.'
    expect(matchAnchor(text2, a)).toBeNull()
  })

  it('hash kontekstu stabilny dla tego samego fragmentu', () => {
    const s = TEXT.indexOf('Klient')
    const a1 = computeAnchor(TEXT, s, s + 6)
    const a2 = computeAnchor(TEXT, s, s + 6)
    expect(a1.contextHash).toBe(a2.contextHash)
    expect(a1.contextHash).toHaveLength(32)
  })
})
