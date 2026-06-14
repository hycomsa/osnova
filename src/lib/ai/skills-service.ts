import type { Payload } from 'payload'
import { DEFAULT_SKILLS, type SkillDef } from './skills'

export interface SkillItem {
  id: string | number | null // null = wirtualny (z domyślnej puli, jeszcze nieskopiowany)
  key: string
  name: string
  description: string
  category: 'apply' | 'refine'
  instruction: string
  enabled: boolean
  builtin: boolean
}

const virtual = (s: SkillDef): SkillItem => ({ id: null, ...s, enabled: true, builtin: true })

// Rzeczywiste skille workspace'u (rekordy w DB), posortowane.
export async function workspaceSkillRows(payload: Payload, wsId: string | number): Promise<any[]> {
  const res = await payload.find({
    collection: 'ai-skills',
    where: { workspace: { equals: wsId } },
    sort: 'sortOrder', limit: 200, overrideAccess: true,
  })
  return res.docs as any[]
}

// Skille do wyboru przez użytkownika (picker): włączone rekordy workspace'u, a gdy brak —
// domyślna pula (wirtualnie), żeby istniejące workspace'y też miały gotowe tryby.
export async function skillsForPicker(payload: Payload, wsId: string | number): Promise<SkillItem[]> {
  const rows = await workspaceSkillRows(payload, wsId)
  if (rows.length === 0) return DEFAULT_SKILLS.map(virtual)
  return rows.filter((r) => r.enabled).map((r) => ({
    id: r.id, key: r.key, name: r.name, description: r.description ?? '', category: r.category, instruction: r.instruction, enabled: !!r.enabled, builtin: !!r.builtin,
  }))
}

// Instrukcja wybranego skilla (po id rekordu lub kluczu); fallback do domyślnej puli.
export async function resolveSkillInstruction(payload: Payload, wsId: string | number, sel?: { id?: string | number; key?: string }): Promise<{ instruction: string; name: string } | null> {
  if (sel?.id != null) {
    const row = await payload.findByID({ collection: 'ai-skills', id: sel.id, overrideAccess: true }).catch(() => null) as any
    if (row && String(typeof row.workspace === 'object' ? row.workspace?.id : row.workspace) === String(wsId) && row.enabled) {
      return { instruction: row.instruction, name: row.name }
    }
  }
  if (sel?.key) {
    const rows = await workspaceSkillRows(payload, wsId)
    const r = rows.find((x) => x.key === sel.key && x.enabled)
    if (r) return { instruction: r.instruction, name: r.name }
    const d = DEFAULT_SKILLS.find((x) => x.key === sel.key)
    if (d) return { instruction: d.instruction, name: d.name }
  }
  return null
}

// Skopiuj domyślną pulę do workspace'u (przy tworzeniu workspace'u). Idempotentne po kluczu.
export async function cloneDefaultSkillsToWorkspace(payload: Payload, wsId: string | number): Promise<void> {
  const existing = new Set((await workspaceSkillRows(payload, wsId)).map((r) => r.key))
  for (let i = 0; i < DEFAULT_SKILLS.length; i++) {
    const s = DEFAULT_SKILLS[i]
    if (existing.has(s.key)) continue
    await payload.create({ collection: 'ai-skills', overrideAccess: true, data: {
      workspace: Number(wsId) || wsId, key: s.key, name: s.name, description: s.description, category: s.category,
      instruction: s.instruction, enabled: true, builtin: true, sortOrder: i,
    } as any }).catch((e) => console.warn('[osnova] clone skill failed:', String((e as Error).message).split('\n')[0]))
  }
}

// Zasiej globalną pulę (workspace = null) — widoczna w /admin jako „ogólny zasób".
export async function seedGlobalSkills(payload: Payload): Promise<void> {
  for (let i = 0; i < DEFAULT_SKILLS.length; i++) {
    const s = DEFAULT_SKILLS[i]
    const found = await payload.find({ collection: 'ai-skills', where: { and: [{ workspace: { exists: false } }, { key: { equals: s.key } }] }, limit: 1, overrideAccess: true })
    if (found.docs[0]) continue
    await payload.create({ collection: 'ai-skills', overrideAccess: true, data: {
      key: s.key, name: s.name, description: s.description, category: s.category,
      instruction: s.instruction, enabled: true, builtin: true, sortOrder: i,
    } as any }).catch(() => {})
  }
}
