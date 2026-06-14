// Kolor węzła zależy od folderu/nadfolderu dokumentu: nadfolder nadaje bazowy odcień
// „rodziny", a podfolder lekko go przesuwa — dokumenty z tego samego obszaru mają pokrewne barwy.

// hash łańcucha → odcień 0..360 (uogólniony hueShift z components/ui/avatar.tsx)
export function hashStringToHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

// zakotwiczone, przyjemne odcienie dla znanych folderów najwyższego poziomu i kodów obszarów
const ANCHOR: Record<string, number> = {
  '.ai': 205, '.ai-framework': 275, '.agents': 32, docs: 150, examples: 95, '.moira-runs': 320,
  tms: 210, cli: 330, carr: 100, app: 45,
}
const AREA = new Set(['tms', 'cli', 'carr', 'app'])

export interface FolderColor { css: string; h: number; s: number; l: number }

const CACHE = new Map<string, FolderColor>()

export function folderToColor(folder: string): FolderColor {
  const hit = CACHE.get(folder)
  if (hit) return hit
  const segs = folder.split('/').filter(Boolean).map((x) => x.toLowerCase())
  let base: number
  if (segs.length === 0) base = 220 // pliki w katalogu głównym
  else {
    // kod obszaru (TMS/CLI/CARR/APP) gdziekolwiek w ścieżce ma priorytet — silne grupowanie po produkcie
    const area = segs.find((x) => AREA.has(x))
    base = area != null ? ANCHOR[area] : ANCHOR[segs[0]] ?? hashStringToHue(segs[0])
  }
  // wariacja z NAJGŁĘBSZEGO (bezpośredniego) folderu, by konkretny katalog się wyróżniał,
  // a rodzina (ten sam nadfolder/obszar) trzymała wspólny odcień (±15°)
  const last = segs[segs.length - 1] ?? ''
  const shift = last ? (hashStringToHue(last) % 30) - 15 : 0
  const h = (((base + shift) % 360) + 360) % 360
  const s = 64
  const l = 60
  const c: FolderColor = { css: `hsl(${h}, ${s}%, ${l}%)`, h, s, l }
  CACHE.set(folder, c)
  return c
}
