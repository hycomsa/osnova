export type WorkspaceRole =
  | 'workspace_maintainer'
  | 'editor'
  | 'client_technical'
  | 'client_business'
  | 'viewer'

export type ViewName = 'direct' | 'client_business' | 'client_technical'

export const ALL_VIEWS: ViewName[] = ['direct', 'client_business', 'client_technical']

export const WORKSPACE_ROLES: WorkspaceRole[] = [
  'workspace_maintainer',
  'editor',
  'client_technical',
  'client_business',
  'viewer',
]

// role „dostawcy/admina" — tylko one mają prawo do widoku bezpośredniego (twarda reguła PRD)
const SUPPLIER_ROLES: WorkspaceRole[] = ['workspace_maintainer', 'editor']

const VIEW_ACCESS: Record<WorkspaceRole, ViewName[]> = {
  workspace_maintainer: ALL_VIEWS,
  editor: ALL_VIEWS,
  client_technical: ['client_technical'],
  client_business: ['client_business'],
  viewer: ['client_business'],
}

export type Permission =
  | 'read'
  | 'comment'
  | 'approve'
  | 'edit-wysiwyg'
  | 'edit-raw'
  | 'page-create'
  | 'page-delete'
  | 'page-rename'
  | 'page-duplicate'
  | 'props-view'
  | 'props-edit'
  | 'history-view'
  | 'view-direct'
  | 'ws-admin'
  | 'ai-use'

// pełna lista uprawnień (kolejność dla UI)
export const ALL_PERMISSIONS: Permission[] = [
  'read', 'comment', 'approve',
  'edit-wysiwyg', 'edit-raw',
  'page-create', 'page-delete', 'page-rename', 'page-duplicate',
  'props-view', 'props-edit', 'history-view',
  'view-direct', 'ai-use', 'ws-admin',
]

// uprawnienia, które opiekun workspace może nadawać/odbierać użytkownikom (bez eskalacji)
export const MANAGEABLE_PERMISSIONS: Permission[] = [
  'comment', 'approve',
  'edit-wysiwyg', 'edit-raw',
  'page-create', 'page-delete', 'page-rename', 'page-duplicate',
  'props-view', 'props-edit', 'history-view', 'ai-use',
]

const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  workspace_maintainer: [
    'read', 'comment', 'approve', 'edit-wysiwyg', 'edit-raw',
    'page-create', 'page-delete', 'page-rename', 'page-duplicate',
    'props-view', 'props-edit', 'history-view', 'view-direct', 'ai-use', 'ws-admin',
  ],
  editor: [
    'read', 'comment', 'edit-wysiwyg', 'edit-raw',
    'page-create', 'page-delete', 'page-rename', 'page-duplicate',
    'props-view', 'props-edit', 'history-view', 'view-direct', 'ai-use',
  ],
  client_technical: ['read', 'comment', 'approve', 'props-view', 'history-view'],
  client_business: ['read', 'comment', 'approve'],
  viewer: ['read'],
}

function unionRolePermissions(roles: WorkspaceRole[]): Set<Permission> {
  const set = new Set<Permission>()
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p)
  return set
}

// Efektywne uprawnienia = (uprawnienia ról ∪ nadane) \ odebrane. System-admin = wszystko.
export function effectivePermissions(
  roles: WorkspaceRole[],
  granted: Permission[] = [],
  revoked: Permission[] = [],
  isSystemAdmin = false,
): Permission[] {
  if (isSystemAdmin) return [...ALL_PERMISSIONS]
  const set = unionRolePermissions(roles)
  for (const g of granted) set.add(g)
  for (const r of revoked) set.delete(r)
  return ALL_PERMISSIONS.filter((p) => set.has(p))
}

// Efektywne widoki: override (jeśli podany) lub z ról; bezpośredni tylko dla ról dostawcy/admina.
export function effectiveViews(
  roles: WorkspaceRole[],
  viewOverride: ViewName[] | undefined,
  isSystemAdmin = false,
): ViewName[] {
  if (isSystemAdmin) return [...ALL_VIEWS]
  let base: Set<ViewName>
  if (viewOverride && viewOverride.length > 0) {
    base = new Set(viewOverride.filter((v) => ALL_VIEWS.includes(v)))
  } else {
    base = new Set<ViewName>()
    for (const r of roles) for (const v of VIEW_ACCESS[r] ?? []) base.add(v)
  }
  // twarda reguła PRD: widok bezpośredni wyłącznie dla ról dostawcy/admina
  if (base.has('direct') && !roles.some((r) => SUPPLIER_ROLES.includes(r))) {
    base.delete('direct')
  }
  return ALL_VIEWS.filter((v) => base.has(v))
}

export function allowedViews(roles: WorkspaceRole[], isSystemAdmin = false): ViewName[] {
  return effectiveViews(roles, undefined, isSystemAdmin)
}

export function canAccessView(perms: ViewName[], view: ViewName): boolean {
  return perms.includes(view)
}

// Czy lista efektywnych uprawnień zawiera dane uprawnienie (system-admin zawsze true).
export function hasPermission(perms: Permission[], perm: Permission, isSystemAdmin = false): boolean {
  if (isSystemAdmin) return true
  return perms.includes(perm)
}

export function canEdit(perms: Permission[], isSystemAdmin = false): boolean {
  return hasPermission(perms, 'edit-wysiwyg', isSystemAdmin) || hasPermission(perms, 'edit-raw', isSystemAdmin)
}

export function canApprove(perms: Permission[], isSystemAdmin = false): boolean {
  return hasPermission(perms, 'approve', isSystemAdmin)
}

// czy zestaw ról to wyłącznie role klienckie (do egzekwowania reguły widoku bezpośredniego)
export function isClientOnly(roles: WorkspaceRole[]): boolean {
  return roles.length > 0 && !roles.some((r) => SUPPLIER_ROLES.includes(r))
}
