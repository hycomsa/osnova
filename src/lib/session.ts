import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'osnova_session'

export interface SessionData {
  sub: string
  email: string
  name?: string
}

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 16) throw new Error('SESSION_SECRET missing or too short')
  return new TextEncoder().encode(s)
}

export async function createSessionToken(data: SessionData, ttlSeconds = 8 * 3600): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return await new SignJWT({ email: data.email, name: data.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(data.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret())
}

export async function verifySessionToken(token: string): Promise<SessionData | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (!payload.sub || typeof payload.email !== 'string') return null
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    }
  } catch {
    return null
  }
}
