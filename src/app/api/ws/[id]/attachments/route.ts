import config from '@payload-config'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { getRequestUser } from '@/lib/auth/request-user'
import { toErrorResponse } from '@/lib/http'
import { getWorkspaceContext, writeBinaryDocument } from '@/lib/read-service'
import { ALL_VIEWS, canEdit, type ViewName } from '@/lib/roles'

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const FILE_EXT = new Set(['pdf', 'txt', 'csv', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}
function sanitizeBase(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return base || 'plik'
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const user = await getRequestUser(req, payload)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = (req.nextUrl.searchParams.get('view') ?? '') as ViewName
  if (!ALL_VIEWS.includes(view)) return NextResponse.json({ error: 'Invalid view' }, { status: 400 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }
  const file = form.get('file')
  const docPath = String(form.get('docPath') ?? '')
  if (!(file instanceof Blob) || !docPath) return NextResponse.json({ error: 'Missing file or docPath' }, { status: 400 })

  const originalName = (file as File).name || 'plik'
  const ext = extOf(originalName)
  const kind: 'image' | 'file' = IMAGE_EXT.has(ext) ? 'image' : 'file'
  if (!IMAGE_EXT.has(ext) && !FILE_EXT.has(ext)) {
    return NextResponse.json({ error: `Niedozwolony typ pliku: .${ext || '?'}` }, { status: 415 })
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Plik za duży (limit 25 MB).' }, { status: 413 })

  try {
    const ctx = await getWorkspaceContext({ payload, user, workspaceId: id, view })
    if (!canEdit(ctx.permissions, ctx.isSystemAdmin)) return NextResponse.json({ error: 'Brak uprawnień do edycji.' }, { status: 403 })

    const docDir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : ''
    const unique = `${sanitizeBase(originalName)}-${randomUUID().slice(0, 8)}${ext ? `.${ext}` : ''}`
    const rel = `.attachments/${unique}`
    const target = `${docDir}${rel}`
    const buf = Buffer.from(await file.arrayBuffer())

    const author = { name: user.name || user.email, email: user.email }
    const { commit } = await writeBinaryDocument(ctx, target, buf, author)
    return NextResponse.json({ ok: true, rel, name: originalName, kind, path: target, commit })
  } catch (e) {
    return toErrorResponse(e)
  }
}
