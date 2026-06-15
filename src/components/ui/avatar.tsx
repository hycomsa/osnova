'use client'

import { useState } from 'react'
import { avatarUrlFor } from '@/lib/avatar'

export function initials(name?: string | null, email?: string): string {
  const src = (name && name.trim()) || (email ? email.split('@')[0].replace(/[._-]+/g, ' ') : '')
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// deterministyczny odcień z tekstu — drobne zróżnicowanie awatarów, w obrębie marki
function hueShift(seed?: string): number {
  if (!seed) return 0
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return (h % 40) - 20
}

export function Avatar({ name, email, size = 32 }: { name?: string | null; email?: string; size?: number }) {
  const shift = hueShift(email || name || '')
  // request a crisp asset (avatar services expose fixed sizes; 96 covers small UI avatars)
  const url = avatarUrlFor(email, size <= 96 ? 96 : 200)
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white shadow-sm ring-1 ring-black/5"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, hsl(calc(var(--primary-h, 186) + ${shift}) 70% 40%), hsl(calc(22 + ${shift}) 85% 50%))`,
      }}
      aria-hidden
    >
      {/* initials base — stays visible until (and unless) the image loads over it */}
      {initials(name, email)}
      {url && !imgFailed && (
        // plain <img> (no next/image) so any external avatar host works without config;
        // on any load error we drop it and the initials remain.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      )}
    </span>
  )
}
