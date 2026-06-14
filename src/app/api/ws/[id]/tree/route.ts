import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { getDocsNodes, getFilesByTag, getTree, getWorkspaceContext, isAttachmentPath } from '@/lib/read-service'
import { currentRevision } from '@/lib/git/worktree'
import { aiConfigured } from '@/lib/ai/apply-comments'
import { ALL_VIEWS, canEdit, hasPermission, type ViewName } from '@/lib/roles'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    const tag = req.nextUrl.searchParams.get('tag')
    const allFiles = tag ? await getFilesByTag(ctx, tag) : await getTree(ctx)
    // załączniki (.attachments/*) są częścią stron — ukryte w drzewie, ale wciąż serwowane przez /file
    const files = allFiles.filter((f) => !isAttachmentPath(f))
    const nodes = await getDocsNodes(ctx, files)
    const canManage = hasPermission(ctx.permissions, 'page-create', ctx.isSystemAdmin)
    const canManageMembers = hasPermission(ctx.permissions, 'ws-admin', ctx.isSystemAdmin)
    // „Wciel komentarze (AI)" wymaga prawa edycji + uprawnienia ai-use; przycisk pokazujemy tylko gdy AI skonfigurowane
    const canUseAI = canEdit(ctx.permissions, ctx.isSystemAdmin) && hasPermission(ctx.permissions, 'ai-use', ctx.isSystemAdmin) && aiConfigured()
    const canViewReports = hasPermission(ctx.permissions, 'reports-view', ctx.isSystemAdmin)
    let revision: string | null = null
    try { revision = await currentRevision(ctx.worktreeDir) } catch { revision = null }
    return NextResponse.json({ view: ctx.view, allowedViews: ctx.allowedViews, files, nodes, canManage, canManageMembers, canUseAI, canViewReports, revision, workspaceName: ctx.workspaceName, workspaceSlug: ctx.workspaceSlug })
  } catch (e) {
    return toErrorResponse(e)
  }
}
