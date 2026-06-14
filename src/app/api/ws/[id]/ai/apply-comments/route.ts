import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { type AcceptedComment, aiConfigured, applyCommentsWithAI } from '@/lib/ai/apply-comments'
import { resolveSkillInstruction } from '@/lib/ai/skills-service'
import { getRequestUser } from '@/lib/auth/request-user'
import { listComments } from '@/lib/comments/service'
import { toErrorResponse } from '@/lib/http'
import { getRawDocument, getWorkspaceContext } from '@/lib/read-service'
import { ALL_VIEWS, canEdit, hasPermission, type ViewName } from '@/lib/roles'

// „Wciel komentarze (AI)": bierze ZAAKCEPTOWANE, otwarte komentarze i proponuje nową treść.
// Nie zapisuje — zwraca propozycję do przeglądu (diff) na froncie. Wymaga edycji + ai-use.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  if (!aiConfigured()) return NextResponse.json({ error: 'AI not configured' }, { status: 501 })

  let body: { path?: string; skillId?: string | number; skillKey?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const path = body.path ?? ''
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    if (!canEdit(ctx.permissions, ctx.isSystemAdmin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!hasPermission(ctx.permissions, 'ai-use', ctx.isSystemAdmin)) return NextResponse.json({ error: 'No AI permission' }, { status: 403 })

    const all = await listComments(payload, ctx, path)
    // tylko zaakceptowane, otwarte, najwyższego poziomu (bez odpowiedzi); odpowiedzi dołączamy jako kontekst
    const top = (all as any[]).filter((c) => c.accepted && c.status !== 'resolved' && !c.parent)
    if (top.length === 0) return NextResponse.json({ error: 'no-accepted-comments' }, { status: 400 })
    const repliesOf = (cid: any) => (all as any[]).filter((c) => c.parent && String(typeof c.parent === 'object' ? c.parent.id : c.parent) === String(cid)).map((c) => String(c.body))
    const accepted: AcceptedComment[] = top.map((c) => ({
      kind: c.kind === 'inline' ? 'inline' : 'document', quote: c.quote ?? null, body: String(c.body), replies: repliesOf(c.id),
    }))

    const { content } = await getRawDocument(ctx, path)
    const skill = await resolveSkillInstruction(payload, ctx.workspaceId, { id: body.skillId, key: body.skillKey })
    const proposal = await applyCommentsWithAI(content, accepted, skill?.instruction)
    const appliedIds = top.map((c) => c.id)
    return NextResponse.json({ ok: true, proposal, appliedCount: accepted.length, appliedIds, skill: skill?.name ?? null })
  } catch (e) {
    if ((e as Error).message === 'AI_NOT_CONFIGURED') return NextResponse.json({ error: 'AI not configured' }, { status: 501 })
    return toErrorResponse(e)
  }
}
