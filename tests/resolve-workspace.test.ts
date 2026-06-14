import { describe, expect, it } from 'vitest'
import { resolveWorkspace, NotFound } from '@/lib/read-service'

function stub(rows: any[]) {
  return {
    find: async ({ where }: any) => {
      const docs = rows.filter((r) => {
        if (where.id) return String(r.id) === String(where.id.equals)
        if (where.slug) return r.slug === where.slug.equals
        return false
      })
      return { docs }
    },
  } as any
}
const ROWS = [{ id: 1, slug: 'ai-sdlc-test', name: 'AI SDLC (test)' }, { id: 2, slug: 'edit-sandbox', name: 'Edit Sandbox' }]

describe('resolveWorkspace', () => {
  it('po numerycznym id', async () => {
    expect((await resolveWorkspace(stub(ROWS), '1')).slug).toBe('ai-sdlc-test')
  })
  it('po slug', async () => {
    expect((await resolveWorkspace(stub(ROWS), 'edit-sandbox')).id).toBe(2)
  })
  it('nieznany → NotFound', async () => {
    await expect(resolveWorkspace(stub(ROWS), 'nieistnieje')).rejects.toBeInstanceOf(NotFound)
  })
})
