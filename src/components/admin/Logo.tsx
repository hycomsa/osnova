import { OsnovaMark } from '../osnova-mark'

export default function AdminLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <OsnovaMark size={44} />
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontSize: 26, letterSpacing: '0.28em', fontWeight: 300 }}>osnova</div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.22em', opacity: 0.6 }}>
          administracja
        </div>
      </div>
    </div>
  )
}
