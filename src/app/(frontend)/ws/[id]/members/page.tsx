'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Plus, Sparkles, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useTranslation } from '@/i18n/client'
import {
  ALL_VIEWS, MANAGEABLE_PERMISSIONS, WORKSPACE_ROLES, effectivePermissions, isClientOnly,
  type Permission, type ViewName, type WorkspaceRole,
} from '@/lib/roles'

interface Member {
  id: string | number; name: string | null; email: string; handle: string
  roles: WorkspaceRole[]; grantedPermissions: Permission[]; revokedPermissions: Permission[]
  viewAccess: ViewName[]; effectivePermissions: Permission[]; effectiveViews: ViewName[]
}
interface UserRow { id: string | number; name?: string | null; email: string }

const CANDIDATE_VIEWS: ViewName[] = ['direct', 'client_business', 'client_technical']

export default function MembersPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const [view, setView] = useState<ViewName | null>(null)
  const [members, setMembers] = useState<Member[] | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)

  // ws-admin ma dostęp do widoku, którego użyjemy do kontekstu API — wykryj pierwszy działający
  const load = useCallback(async () => {
    for (const v of CANDIDATE_VIEWS) {
      const r = await fetch(`/api/ws/${id}/members?view=${v}`)
      if (!r.ok) continue
      const d = await r.json()
      if (!d.canManage) { setDenied(true); setMembers([]); return }
      setView(v); setCanManage(true); setMembers(d.members ?? []); setDenied(false)
      return
    }
    setDenied(true); setMembers([])
  }, [id])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    fetch('/api/users?limit=500&depth=0').then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d) => setUsers((d.docs ?? []).map((u: any) => ({ id: u.id, name: u.name, email: u.email })))).catch(() => {})
  }, [])

  const memberIds = useMemo(() => new Set((members ?? []).map((m) => String(m.id))), [members])
  const addable = users.filter((u) => !memberIds.has(String(u.id)))

  const roleLabel = (r: WorkspaceRole) => t(`members.role.${r}`)
  const save = async (userId: string | number, roles: WorkspaceRole[], granted: Permission[], revoked: Permission[], viewAccess: ViewName[]) => {
    if (!view) return
    setBusy(true)
    try {
      const r = await fetch(`/api/ws/${id}/members?view=${view}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, roles, grantedPermissions: granted, revokedPermissions: revoked, viewAccess }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? `Błąd (${r.status})`) }
      else { setEditing(null); await load() }
    } finally { setBusy(false) }
  }
  const remove = async (userId: string | number) => {
    if (!view || !confirm(t('members.removeConfirm'))) return
    setBusy(true)
    try {
      const r = await fetch(`/api/ws/${id}/members?view=${view}&userId=${userId}`, { method: 'DELETE' })
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? `Błąd (${r.status})`) } else await load()
    } finally { setBusy(false) }
  }
  const addMember = async (userId: string | number) => { await save(userId, ['viewer'], [], [], []); setEditing(String(userId)) }

  return (
    <>
      <AppHeader workspace={{ id }} />
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Users size={22} className="text-accent" />
          <h1 className="text-xl font-semibold tracking-tight">{t('members.title')}</h1>
          <Link href={`/ws/${id}/ai-skills`} className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Sparkles size={15} /> {t('aiskills.title')}
          </Link>
          <Link href={`/ws/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={15} /> {t('members.back')}
          </Link>
        </div>

        {members === null ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground"><Spinner /> {t('common.loading')}</div>
        ) : denied ? (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">{t('viewer.forbiddenTitle')}</p>
        ) : (
          <>
            {/* dodaj członka */}
            {addable.length > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <select disabled={busy} defaultValue="" onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) void addMember(v) }}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-accent">
                  <option value="" disabled>{t('members.addMember')}…</option>
                  {addable.map((u) => <option key={String(u.id)} value={String(u.id)}>{u.name || u.email}</option>)}
                </select>
                <Plus size={16} className="text-muted-foreground" />
              </div>
            )}

            <ul className="space-y-2">
              {members.length === 0 && <li className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">{t('members.noMembers')}</li>}
              {members.map((m) => (
                <MemberRow key={String(m.id)} m={m} roleLabel={roleLabel} t={t} busy={busy}
                  expanded={editing === String(m.id)} onToggle={() => setEditing(editing === String(m.id) ? null : String(m.id))}
                  onSave={save} onRemove={remove} />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  )
}

function MemberRow({ m, roleLabel, t, busy, expanded, onToggle, onSave, onRemove }: {
  m: Member; roleLabel: (r: WorkspaceRole) => string; t: (k: string) => string; busy: boolean
  expanded: boolean; onToggle: () => void
  onSave: (userId: string | number, roles: WorkspaceRole[], granted: Permission[], revoked: Permission[], viewAccess: ViewName[]) => void
  onRemove: (userId: string | number) => void
}) {
  const [roles, setRoles] = useState<WorkspaceRole[]>(m.roles)
  const [desired, setDesired] = useState<Set<Permission>>(new Set(m.effectivePermissions))
  const [views, setViews] = useState<Set<ViewName>>(new Set(m.effectiveViews))

  // domyślne uprawnienia z wybranych ról (na żywo) — do oznaczania „z roli" i wyliczenia override
  const roleDefault = useMemo(() => new Set(effectivePermissions(roles, [], [], false)), [roles])
  const clientOnly = isClientOnly(roles)

  const toggleRole = (r: WorkspaceRole) => setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])
  const togglePerm = (p: Permission) => setDesired((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })
  const toggleView = (v: ViewName) => setViews((prev) => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })

  const doSave = () => {
    const granted = MANAGEABLE_PERMISSIONS.filter((p) => desired.has(p) && !roleDefault.has(p))
    const revoked = MANAGEABLE_PERMISSIONS.filter((p) => !desired.has(p) && roleDefault.has(p))
    const viewAccess = ALL_VIEWS.filter((v) => views.has(v) && !(v === 'direct' && clientOnly))
    onSave(m.id, roles, granted, revoked, viewAccess)
  }

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-secondary/30" onClick={onToggle}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/30 to-accent/30 text-xs font-semibold uppercase">
          {(m.name || m.email).slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{m.name || m.handle}</div>
          <div className="truncate text-xs text-muted-foreground">{m.email}</div>
        </div>
        <div className="hidden flex-wrap gap-1 sm:flex">
          {m.roles.map((r) => <span key={r} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{roleLabel(r)}</span>)}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4">
          <div className="grid gap-5 md:grid-cols-3">
            {/* Role */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('members.roles')}</div>
              <div className="space-y-1">
                {WORKSPACE_ROLES.map((r) => (
                  <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-accent" checked={roles.includes(r)} onChange={() => toggleRole(r)} />
                    {roleLabel(r)}
                  </label>
                ))}
              </div>
            </div>
            {/* Uprawnienia granularne */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('members.permissions')}</div>
              <div className="space-y-1">
                {MANAGEABLE_PERMISSIONS.map((p) => (
                  <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-accent" checked={desired.has(p)} onChange={() => togglePerm(p)} />
                    <span>{t(`perms.${p}`)}</span>
                    {roleDefault.has(p) && <span className="text-[10px] text-muted-foreground/60">({t('members.fromRole')})</span>}
                  </label>
                ))}
              </div>
            </div>
            {/* Widoki */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('members.viewsLabel')}</div>
              <div className="space-y-1">
                {ALL_VIEWS.map((v) => {
                  const disabled = v === 'direct' && clientOnly
                  return (
                    <label key={v} className={`flex items-center gap-2 text-sm ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      <input type="checkbox" className="accent-accent" disabled={disabled} checked={views.has(v) && !disabled} onChange={() => toggleView(v)} />
                      {t(`views.${v}`)}
                    </label>
                  )
                })}
                {clientOnly && <p className="mt-1 text-[10px] text-muted-foreground/70">{t('members.directClientHint')}</p>}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" disabled={busy || roles.length === 0} onClick={doSave}>{busy ? <Spinner className="mr-1" /> : null}{t('members.save')}</Button>
            <button onClick={() => onRemove(m.id)} disabled={busy} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">
              <Trash2 size={14} /> {t('members.remove')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
