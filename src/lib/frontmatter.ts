import { parse } from 'yaml'

export function parseFrontmatter(content: string): Record<string, unknown> {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end === -1) return {}
  const block = content.slice(content.indexOf('\n') + 1, end)
  try {
    const data = parse(block)
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function extractTags(fm: Record<string, unknown>): string[] {
  const t = fm.tags
  if (Array.isArray(t)) return t.filter((x) => typeof x === 'string') as string[]
  if (typeof t === 'string') return t.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}
