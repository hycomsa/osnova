import { md5 } from './md5'

// Build an avatar image URL for an email from a configurable, Gravatar-style template.
// Configure NEXT_PUBLIC_AVATAR_URL_TEMPLATE with {hash} and {size} placeholders, e.g.
//   https://avatar.example.com/avatar/{size}/{hash}.jpg
// {hash} = md5(lowercased email). Returns null when no template or no email is set, in which
// case the UI falls back to rendered initials.
export function avatarUrlFor(email?: string | null, size = 96): string | null {
  const template = (process.env.NEXT_PUBLIC_AVATAR_URL_TEMPLATE ?? '').trim()
  const addr = (email ?? '').trim().toLowerCase()
  if (!template || !addr) return null
  const hash = md5(addr)
  return template.replaceAll('{hash}', hash).replaceAll('{size}', String(size))
}
