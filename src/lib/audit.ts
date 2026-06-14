import type { Payload } from 'payload'
import type { AuditAction } from '@/collections/AuditLog'

export interface AuditEntry {
  action: AuditAction
  workspaceId?: string | number | null
  userId?: string | number | null
  userEmail?: string | null
  view?: string | null
  path?: string | null
  detail?: string | null
}

// Zapis zdarzenia audytu — best-effort: nigdy nie przerywa żądania (błąd tylko logowany).
export async function logAudit(payload: Payload, entry: AuditEntry): Promise<void> {
  try {
    await payload.create({
      collection: 'audit-log',
      overrideAccess: true,
      data: {
        action: entry.action,
        workspace: entry.workspaceId != null ? Number(entry.workspaceId) || entry.workspaceId : undefined,
        userId: entry.userId != null ? String(entry.userId) : undefined,
        userEmail: entry.userEmail ?? undefined,
        view: entry.view ?? undefined,
        path: entry.path ?? undefined,
        detail: entry.detail ?? undefined,
      } as any,
    })
  } catch (e) {
    console.warn('[osnova] audit log failed:', String((e as Error).message).split('\n')[0])
  }
}
