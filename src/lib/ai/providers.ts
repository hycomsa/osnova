import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// Wieloprostawcowa warstwa LLM: Anthropic, OpenAI oraz Ollama (przez endpoint zgodny z OpenAI).
// Konfiguracja wyłącznie z ENV (klucze nigdy nie trafiają do przeglądarki).
export type ProviderId = 'anthropic' | 'openai' | 'ollama'

export interface ProviderInfo {
  id: ProviderId
  label: string
  configured: boolean
  model: string
  baseUrl?: string
  active: boolean
}

export interface HealthResult {
  id: ProviderId
  ok: boolean
  configured: boolean
  model: string
  latencyMs?: number
  sample?: string
  error?: string
}

const HEALTH_TIMEOUT_MS = 20_000

const env = (k: string) => { const v = process.env[k]; return v && v.trim() ? v.trim() : undefined }

const ANTHROPIC_MODEL = () => env('ANTHROPIC_MODEL') || 'claude-sonnet-4-6'
const OPENAI_MODEL = () => env('OPENAI_MODEL') || 'gpt-4o-mini'
const OPENAI_BASE_URL = () => env('OPENAI_BASE_URL')
const OLLAMA_BASE_URL = () => env('OLLAMA_BASE_URL') || 'http://localhost:11434'
const OLLAMA_MODEL = () => env('OLLAMA_MODEL') || 'llama3.1'

function isConfigured(id: ProviderId): boolean {
  if (id === 'anthropic') return Boolean(env('ANTHROPIC_API_KEY'))
  if (id === 'openai') return Boolean(env('OPENAI_API_KEY'))
  // Ollama jest lokalny/bez klucza — uznajemy za skonfigurowany tylko gdy jawnie wskazano URL.
  if (id === 'ollama') return Boolean(env('OLLAMA_BASE_URL'))
  return false
}

const ORDER: ProviderId[] = ['anthropic', 'openai', 'ollama']
const LABELS: Record<ProviderId, string> = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI', ollama: 'Ollama' }

function modelOf(id: ProviderId): string {
  return id === 'anthropic' ? ANTHROPIC_MODEL() : id === 'openai' ? OPENAI_MODEL() : OLLAMA_MODEL()
}

// Aktywny dostawca: AI_PROVIDER z env (jeśli skonfigurowany), inaczej pierwszy skonfigurowany.
export function activeProvider(): ProviderId | null {
  const pref = env('AI_PROVIDER') as ProviderId | undefined
  if (pref && ORDER.includes(pref) && isConfigured(pref)) return pref
  return ORDER.find(isConfigured) ?? null
}

export function anyProviderConfigured(): boolean {
  return ORDER.some(isConfigured)
}

export function listProviders(): ProviderInfo[] {
  const active = activeProvider()
  return ORDER.map((id) => ({
    id,
    label: LABELS[id],
    configured: isConfigured(id),
    model: modelOf(id),
    baseUrl: id === 'ollama' ? OLLAMA_BASE_URL() : id === 'openai' ? OPENAI_BASE_URL() : undefined,
    active: id === active,
  }))
}

interface CompleteOpts { system: string; user: string; maxTokens?: number; provider?: ProviderId }

// Pojedyncze uzupełnienie tekstu od wybranego (lub aktywnego) dostawcy.
export async function complete(opts: CompleteOpts): Promise<string> {
  const id = opts.provider ?? activeProvider()
  if (!id) throw new Error('AI_NOT_CONFIGURED')
  if (!isConfigured(id)) throw new Error(`PROVIDER_NOT_CONFIGURED:${id}`)
  const maxTokens = opts.maxTokens ?? 8192

  if (id === 'anthropic') {
    const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), timeout: HEALTH_TIMEOUT_MS })
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL(), max_tokens: maxTokens, system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    })
    return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim()
  }

  // OpenAI oraz Ollama korzystają z tego samego, zgodnego z OpenAI klienta (różny baseURL/klucz).
  const client = id === 'ollama'
    ? new OpenAI({ apiKey: 'ollama', baseURL: `${OLLAMA_BASE_URL().replace(/\/$/, '')}/v1`, timeout: HEALTH_TIMEOUT_MS })
    : new OpenAI({ apiKey: env('OPENAI_API_KEY'), baseURL: OPENAI_BASE_URL(), timeout: HEALTH_TIMEOUT_MS })
  const res = await client.chat.completions.create({
    model: modelOf(id), max_tokens: maxTokens,
    messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }],
  })
  return (res.choices[0]?.message?.content ?? '').trim()
}

// Healthcheck: czy dostawca jest skonfigurowany i czy model rzeczywiście odpowiada.
export async function healthCheck(id: ProviderId): Promise<HealthResult> {
  const model = modelOf(id)
  if (!isConfigured(id)) return { id, ok: false, configured: false, model, error: 'Nie skonfigurowano (brak klucza/URL w env)' }
  const t0 = Date.now()
  try {
    const out = await complete({
      provider: id, maxTokens: 16,
      system: 'You are a health probe. Reply with exactly the word: OK',
      user: 'ping',
    })
    return { id, ok: out.length > 0, configured: true, model, latencyMs: Date.now() - t0, sample: out.slice(0, 60) }
  } catch (e) {
    return { id, ok: false, configured: true, model, latencyMs: Date.now() - t0, error: String((e as Error).message).split('\n')[0].slice(0, 200) }
  }
}

export async function healthCheckAll(): Promise<HealthResult[]> {
  return Promise.all(listProviders().filter((p) => p.configured).map((p) => healthCheck(p.id)))
}
