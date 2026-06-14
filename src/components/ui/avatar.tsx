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
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-sm ring-1 ring-black/5"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, hsl(calc(var(--primary-h, 186) + ${shift}) 70% 40%), hsl(calc(22 + ${shift}) 85% 50%))`,
      }}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  )
}
