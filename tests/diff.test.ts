import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff } from '@/lib/git/diff'

const SAMPLE = `diff --git a/doc.md b/doc.md
index 111..222 100644
--- a/doc.md
+++ b/doc.md
@@ -1,4 +1,4 @@
 # Tytuł
-stara linia
+nowa linia
 wspólna
+dodana na końcu
`

describe('parseUnifiedDiff', () => {
  it('parsuje hunki z numeracją i liczy zmiany', () => {
    const d = parseUnifiedDiff(SAMPLE)
    expect(d.binary).toBe(false)
    expect(d.hunks).toHaveLength(1)
    expect(d.additions).toBe(2)
    expect(d.deletions).toBe(1)
    const h = d.hunks[0]
    // pierwsza linia: kontekst „# Tytuł" old=1 new=1
    expect(h.lines[0]).toMatchObject({ type: 'ctx', oldNo: 1, newNo: 1, text: '# Tytuł' })
    const del = h.lines.find((l) => l.type === 'del')!
    const add = h.lines.find((l) => l.type === 'add')!
    expect(del).toMatchObject({ oldNo: 2, newNo: null, text: 'stara linia' })
    expect(add).toMatchObject({ oldNo: null, newNo: 2, text: 'nowa linia' })
  })

  it('wykrywa pliki binarne', () => {
    const d = parseUnifiedDiff('diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ')
    expect(d.binary).toBe(true)
    expect(d.hunks).toHaveLength(0)
  })

  it('pusty diff → brak hunków', () => {
    expect(parseUnifiedDiff('')).toEqual({ hunks: [], additions: 0, deletions: 0, binary: false })
  })
})
