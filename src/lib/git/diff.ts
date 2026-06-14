// Parser zunifikowanego diffa (`git diff`) → struktura do renderu side-by-side/unified.

export type DiffLineType = 'ctx' | 'add' | 'del'
export interface DiffLine {
  type: DiffLineType
  oldNo: number | null
  newNo: number | null
  text: string
}
export interface DiffHunk {
  header: string
  lines: DiffLine[]
}
export interface FileDiff {
  hunks: DiffHunk[]
  additions: number
  deletions: number
  binary: boolean
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

export function parseUnifiedDiff(raw: string): FileDiff {
  const out: FileDiff = { hunks: [], additions: 0, deletions: 0, binary: false }
  if (/^Binary files .* differ$/m.test(raw)) out.binary = true

  let hunk: DiffHunk | null = null
  let oldNo = 0
  let newNo = 0
  for (const line of raw.split('\n')) {
    const m = HUNK_RE.exec(line)
    if (m) {
      oldNo = Number(m[1])
      newNo = Number(m[2])
      hunk = { header: m[3].trim(), lines: [] }
      out.hunks.push(hunk)
      continue
    }
    if (!hunk) continue // nagłówki diff --git / index / +++ / --- pomijamy
    if (line.startsWith('\\')) continue // „\ No newline at end of file"
    const tag = line[0]
    const text = line.slice(1)
    if (tag === '+') {
      hunk.lines.push({ type: 'add', oldNo: null, newNo, text })
      newNo += 1
      out.additions += 1
    } else if (tag === '-') {
      hunk.lines.push({ type: 'del', oldNo, newNo: null, text })
      oldNo += 1
      out.deletions += 1
    } else if (tag === ' ') {
      hunk.lines.push({ type: 'ctx', oldNo, newNo, text })
      oldNo += 1
      newNo += 1
    }
  }
  return out
}
