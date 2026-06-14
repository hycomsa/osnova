export function OsnovaMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 2l3.5 7.8L27 12l-6 5.2L22.5 25 16 21l-6.5 4L11 17.2 5 12l7.5-2.2L16 2z"
        stroke="hsl(var(--primary))" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 7l2.2 5.2L23 13l-3.8 3.3L20 21l-4-2.4L12 21l.8-4.7L9 13l4.8-.8L16 7z"
        stroke="hsl(var(--accent))" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}
