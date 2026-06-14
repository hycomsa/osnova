import * as oidc from 'openid-client'

let cached: oidc.Configuration | null = null

export async function keycloakConfig(): Promise<oidc.Configuration> {
  if (cached) return cached
  const issuer = process.env.KEYCLOAK_ISSUER
  const clientId = process.env.KEYCLOAK_CLIENT_ID
  if (!issuer || !clientId) throw new Error('KEYCLOAK_ISSUER / KEYCLOAK_CLIENT_ID not set')
  const secret = process.env.KEYCLOAK_CLIENT_SECRET
  cached = await oidc.discovery(new URL(issuer), clientId, secret && secret.length > 0 ? secret : undefined)
  return cached
}

export function redirectUri(): string {
  return `${process.env.APP_URL}/api/auth/callback`
}
