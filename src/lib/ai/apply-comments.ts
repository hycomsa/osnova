import Anthropic from '@anthropic-ai/sdk'

// Model do wcielania komentarzy (potwierdzone z użytkownikiem: Sonnet 4.6). Nadpisywalny przez env.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export interface AcceptedComment {
  kind: 'inline' | 'document'
  quote?: string | null
  body: string
  replies?: string[]
}

const SYSTEM = `Jesteś redaktorem dokumentacji technicznej. Twoim zadaniem jest WCIELIĆ zaakceptowane uwagi recenzentów do dokumentu Markdown.
Zasady:
- Zwróć PEŁNĄ, zmienioną treść dokumentu w Markdown — nic poza nią (bez wstępu, bez komentarzy, bez bloku \`\`\`).
- Zachowaj strukturę, styl, język i formatowanie oryginału; zmieniaj tylko to, co wynika z uwag.
- Uwagi inline odnoszą się do zacytowanego fragmentu — nanieś poprawkę w tym miejscu.
- Nie wymyślaj treści ani faktów; jeśli uwaga jest pytaniem/niejednoznaczna, nanieś najbardziej zachowawczą sensowną zmianę.
- Nie usuwaj treści niezwiązanej z uwagami.`

function buildUserPrompt(doc: string, comments: AcceptedComment[]): string {
  const items = comments.map((c, i) => {
    const head = c.kind === 'inline' && c.quote ? `Uwaga inline do fragmentu: „${c.quote}"` : 'Uwaga do całego dokumentu'
    const replies = c.replies && c.replies.length ? `\n   Wątek: ${c.replies.join(' | ')}` : ''
    return `${i + 1}. ${head}\n   Treść uwagi: ${c.body}${replies}`
  }).join('\n')
  return `DOKUMENT (Markdown):\n<<<DOC\n${doc}\nDOC\n\nZAAKCEPTOWANE UWAGI DO WCIELENIA:\n${items}\n\nZwróć cały zmieniony dokument Markdown.`
}

// usuń ewentualne opakowanie w ```...``` gdyby model je dodał wbrew instrukcji
function unwrapFence(s: string): string {
  const m = s.match(/^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/)
  return m ? m[1] : s
}

export async function applyCommentsWithAI(doc: string, comments: AcceptedComment[], skillInstruction?: string): Promise<string> {
  if (!aiConfigured()) throw new Error('AI_NOT_CONFIGURED')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const system = skillInstruction?.trim() ? `${SYSTEM}\n\nWYBRANY TRYB: ${skillInstruction.trim()}` : SYSTEM
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: buildUserPrompt(doc, comments) }],
  })
  const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
  return unwrapFence(text.trim())
}
