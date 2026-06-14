import type { Access } from 'payload'

export const anyLoggedIn: Access = ({ req }) => Boolean(req.user)

export const isSystemAdmin: Access = ({ req }) =>
  Boolean(((req.user as any)?.globalRoles as string[] | undefined)?.includes('system_admin'))
