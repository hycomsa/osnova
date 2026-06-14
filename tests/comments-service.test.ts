import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createComment, deleteComment, extractMentionHandles, listComments, toggleReaction } from '@/lib/comments/service'
import { AccessDenied } from '@/lib/read-service'
import type { WorkspaceContext } from '@/lib/read-service'
import { effectivePermissions, type WorkspaceRole } from '@/lib/roles'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'osnova-cm-')) })

function ctx(roles: WorkspaceRole[], rules = { include: ['**'], exclude: [] }, isSystemAdmin = false): WorkspaceContext {
  return { workspaceId: 'w1', view: 'direct', rules, worktreeDir: dir, branch: 'main', roles, permissions: effectivePermissions(roles, [], [], isSystemAdmin), isSystemAdmin, showMetadata: false, allowedViews: [], payload: {} as any, userId: 'u1' }
}
function stub() {
  const created: any[] = []
  return {
    created,
    payload: {
      create: async ({ data }: any) => { const d = { id: created.length + 1, ...data }; created.push(d); return d },
      find: async () => ({ docs: created }),
      findByID: async ({ id }: any) => created.find((c) => c.id === id) ?? null,
      update: async ({ id, data }: any) => { const c = created.find((x) => x.id === id); Object.assign(c, data); return c },
      delete: async () => ({}),
    } as any,
  }
}

describe('comments service authz', () => {
  it('viewer nie może komentować (brak comment)', async () => {
    const { payload } = stub()
    await expect(createComment(payload, ctx(['viewer']), { id: 'u', email: 'u@x.pl' }, { path: 'a.md', kind: 'document', body: 'hej' }))
      .rejects.toBeInstanceOf(AccessDenied)
  })
  it('client_business może komentować', async () => {
    const { payload } = stub()
    const c = await createComment(payload, ctx(['client_business']), { id: 'u', email: 'u@x.pl', name: 'U' }, { path: 'a.md', kind: 'inline', body: 'uwaga', quote: 'X' })
    expect(c.id).toBeTruthy()
    expect(c.authorEmail).toBe('u@x.pl')
    expect(c.status).toBe('open')
  })
  it('komentarz do pliku poza widokiem → AccessDenied', async () => {
    const { payload } = stub()
    const restricted = { include: ['allowed/**'], exclude: [] }
    await expect(createComment(payload, ctx(['client_business'], restricted), { id: 'u', email: 'u@x.pl' }, { path: 'secret.md', kind: 'document', body: 'x' }))
      .rejects.toBeInstanceOf(AccessDenied)
    await expect(listComments(payload, ctx(['client_business'], restricted), 'secret.md')).rejects.toBeInstanceOf(AccessDenied)
  })
  it('autor może usunąć swój komentarz; obcy bez ws-admin nie', async () => {
    const { payload } = stub()
    const c = await createComment(payload, ctx(['client_business']), { id: 'author', email: 'a@x.pl' }, { path: 'a.md', kind: 'document', body: 'm' })
    await expect(deleteComment(payload, ctx(['client_business']), { id: 'other', email: 'o@x.pl' }, c.id)).rejects.toBeInstanceOf(AccessDenied)
    await expect(deleteComment(payload, ctx(['client_business']), { id: 'author', email: 'a@x.pl' }, c.id)).resolves.toEqual({ ok: true })
  })
  it('reakcje: toggle dodaje i usuwa per użytkownik', async () => {
    const { payload } = stub()
    const c = await createComment(payload, ctx(['client_business']), { id: 'u1', email: 'u1@x.pl' }, { path: 'a.md', kind: 'document', body: 'm' })
    let r = await toggleReaction(payload, ctx(['client_business']), { id: 'u1', email: 'u1@x.pl' }, c.id, '👍')
    expect(r.reactions).toEqual([{ emoji: '👍', authorSub: 'u1' }])
    r = await toggleReaction(payload, ctx(['client_business']), { id: 'u2', email: 'u2@x.pl' }, c.id, '👍')
    expect(r.reactions).toHaveLength(2)
    r = await toggleReaction(payload, ctx(['client_business']), { id: 'u1', email: 'u1@x.pl' }, c.id, '👍')
    expect(r.reactions).toEqual([{ emoji: '👍', authorSub: 'u2' }])
  })
  it('extractMentionHandles wyłuskuje uchwyty; e-mail w treści nie liczy się', () => {
    expect(extractMentionHandles('hej @jan.kowalski oraz @anna-nowak!')).toEqual(['jan.kowalski', 'anna-nowak'])
    expect(extractMentionHandles('napisz na user@example.com')).toEqual([])
    expect(extractMentionHandles('@a @a duplikat')).toEqual(['a'])
  })
  it('@wzmianka tworzy powiadomienie dla wspomnianego członka (nie dla autora ani nieznanego)', async () => {
    const created: any[] = []
    const members = [
      { user: { id: 'u-jan', email: 'jan.kowalski@x.pl', name: 'Jan' } },
      { user: { id: 'author', email: 'a@x.pl', name: 'Autor' } },
    ]
    const payload = {
      create: async ({ collection, data }: any) => { const d = { id: created.length + 1, collection, ...data }; created.push(d); return d },
      find: async ({ collection }: any) => (collection === 'memberships' ? { docs: members } : { docs: created }),
      findByID: async ({ id }: any) => created.find((c) => c.id === id) ?? null,
      update: async () => ({}),
      delete: async () => ({}),
    } as any
    await createComment(payload, ctx(['client_business']), { id: 'author', email: 'a@x.pl', name: 'Autor' }, { path: 'a.md', kind: 'document', body: 'cześć @jan.kowalski i @a i @nieznany' })
    const notifs = created.filter((c) => c.collection === 'notifications')
    expect(notifs).toHaveLength(1)
    expect(String(notifs[0].recipient)).toBe('u-jan')
    expect(notifs[0].type).toBe('mention')
  })
  it('odpowiedź w wątku powiadamia autora rodzica (nie autora odpowiedzi)', async () => {
    const created: any[] = []
    const parent = { id: 'p1', authorSub: 'u-jan', body: 'pytanie' }
    const payload = {
      create: async ({ collection, data }: any) => { const d = { id: created.length + 1, collection, ...data }; created.push(d); return d },
      find: async ({ collection }: any) => (collection === 'memberships' || collection === 'comments' ? { docs: [] } : { docs: created }),
      findByID: async ({ id }: any) => (id === 'p1' ? parent : created.find((c) => c.id === id) ?? null),
      update: async () => ({}),
      delete: async () => ({}),
    } as any
    await createComment(payload, ctx(['client_business']), { id: 'u-anna', email: 'anna@x.pl', name: 'Anna' }, { path: 'a.md', kind: 'document', body: 'moja odpowiedź', parent: 'p1' })
    const notifs = created.filter((c) => c.collection === 'notifications')
    expect(notifs).toHaveLength(1)
    expect(notifs[0].type).toBe('reply')
    expect(String(notifs[0].recipient)).toBe('u-jan')
  })
  it('reakcja: viewer (brak comment) → AccessDenied; nieprawidłowe emoji → AccessDenied', async () => {
    const { payload } = stub()
    const c = await createComment(payload, ctx(['client_business']), { id: 'a', email: 'a@x.pl' }, { path: 'a.md', kind: 'document', body: 'm' })
    await expect(toggleReaction(payload, ctx(['viewer']), { id: 'v', email: 'v@x.pl' }, c.id, '👍')).rejects.toBeInstanceOf(AccessDenied)
    await expect(toggleReaction(payload, ctx(['client_business']), { id: 'a', email: 'a@x.pl' }, c.id, '💩')).rejects.toBeInstanceOf(AccessDenied)
  })
})
