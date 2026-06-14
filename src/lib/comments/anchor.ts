import { createHash } from 'node:crypto'
import { computeAnchorParts, matchAnchor, type AnchorParts } from './anchor-match'

export { computeAnchorParts, matchAnchor }
export type { AnchorParts }

export interface Anchor extends AnchorParts {
  contextHash: string
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function hashContext(prefix: string, quote: string, suffix: string): string {
  return createHash('sha256').update(normalize(prefix + quote + suffix)).digest('hex').slice(0, 32)
}

export function computeAnchor(text: string, start: number, end: number): Anchor {
  const parts = computeAnchorParts(text, start, end)
  return { ...parts, contextHash: hashContext(parts.prefix, parts.quote, parts.suffix) }
}
