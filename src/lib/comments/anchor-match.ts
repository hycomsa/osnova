const CTX = 40

export interface AnchorParts {
  quote: string
  prefix: string
  suffix: string
}

export function computeAnchorParts(text: string, start: number, end: number): AnchorParts {
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CTX), start),
    suffix: text.slice(end, end + CTX),
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}
function commonSuffixLen(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}
function commonPrefixLen(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}
function allIndices(text: string, needle: string): number[] {
  if (!needle) return []
  const out: number[] = []
  let i = text.indexOf(needle)
  while (i !== -1) { out.push(i); i = text.indexOf(needle, i + 1) }
  return out
}

export function matchAnchor(text: string, anchor: AnchorParts): { index: number; length: number } | null {
  const { quote, prefix, suffix } = anchor
  if (!quote) return null
  const hits = allIndices(text, quote)
  if (hits.length === 1) return { index: hits[0], length: quote.length }
  if (hits.length > 1) {
    let best = hits[0]; let bestScore = -1
    for (const idx of hits) {
      const before = text.slice(Math.max(0, idx - prefix.length), idx)
      const after = text.slice(idx + quote.length, idx + quote.length + suffix.length)
      const score = commonSuffixLen(prefix, before) + commonPrefixLen(suffix, after)
      if (score > bestScore) { bestScore = score; best = idx }
    }
    return { index: best, length: quote.length }
  }
  const nText = normalize(text); const nQuote = normalize(quote)
  if (nQuote && nText.includes(nQuote)) {
    const firstWord = nQuote.split(' ')[0]
    const approx = text.indexOf(firstWord)
    if (approx !== -1) return { index: approx, length: firstWord.length }
  }
  return null
}
