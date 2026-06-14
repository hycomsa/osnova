'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { archetypeFor, GLYPH } from './archetypes'
import { folderToColor } from './color'
import type { RawNode } from './layout'

interface Edge { source: string; target: string }

const W = 216
const H = 42
const COL_GAP = 300
const ROW_GAP = 54

interface Placed { node: RawNode; x: number; y: number; glyph: string; color: string; isCenter: boolean }
interface Box { minX: number; minY: number; maxX: number; maxY: number }

// Układ warstwowy: kolumny wg odległości (depth) od bieżącego dokumentu, w kolumnie grupowane
// po folderze. Deterministyczny i czytelny — pokazuje WSZYSTKIE realne zależności.
function layout(nodes: RawNode[], centerPath: string): { placed: Map<string, Placed>; box: Box } {
  const byDepth = new Map<number, RawNode[]>()
  for (const n of nodes) { const d = byDepth.get(n.depth) ?? []; d.push(n); byDepth.set(n.depth, d) }
  const placed = new Map<string, Placed>()
  const box: Box = { minX: 0, minY: 0, maxX: W, maxY: H }
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    const col = byDepth.get(d)!.sort((a, b) => (a.folder.localeCompare(b.folder) || a.label.localeCompare(b.label)))
    const offset = -((col.length - 1) * ROW_GAP) / 2
    col.forEach((n, i) => {
      const x = d * COL_GAP, y = offset + i * ROW_GAP
      placed.set(n.path, {
        node: n, x, y,
        glyph: GLYPH[archetypeFor(n.docType, n.path === centerPath)],
        color: folderToColor(n.folder).css, isCenter: n.path === centerPath,
      })
      box.minX = Math.min(box.minX, x); box.minY = Math.min(box.minY, y)
      box.maxX = Math.max(box.maxX, x + W); box.maxY = Math.max(box.maxY, y + H)
    })
  }
  return { placed, box }
}

// punkt na krawędzi prostokąta `to` w kierunku `from` (żeby strzałka nie znikała pod węzłem)
function rectEdge(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = from.x - to.x, dy = from.y - to.y
  if (dx === 0 && dy === 0) return to
  const s = Math.min((W / 2) / Math.abs(dx || 1e-6), (H / 2) / Math.abs(dy || 1e-6))
  return { x: to.x + dx * s, y: to.y + dy * s }
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s }

export function DepGraph({ nodes, edges, centerPath, onOpen }: {
  nodes: RawNode[]; edges: Edge[]; centerPath: string; onOpen: (p: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [vx, setVx] = useState(0); const [vy, setVy] = useState(0); const [k, setK] = useState(1)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  const { placed, box } = useMemo(() => layout(nodes, centerPath), [nodes, centerPath])

  const { adj, paths } = useMemo(() => {
    const adj = new Map<string, Set<string>>()
    const add = (a: string, b: string) => { (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b) }
    const paths: { id: string; d: string; color: string; a: string; b: string }[] = []
    for (const e of edges) {
      const s = placed.get(e.source), t = placed.get(e.target)
      if (!s || !t) continue
      add(e.source, e.target); add(e.target, e.source)
      const sc = { x: s.x + W / 2, y: s.y + H / 2 }, tc = { x: t.x + W / 2, y: t.y + H / 2 }
      const p1 = rectEdge(tc, sc), p2 = rectEdge(sc, tc)
      const off = Math.max(36, Math.abs(p2.x - p1.x) * 0.45)
      paths.push({ id: `${e.source}|${e.target}`, color: s.color, a: e.source, b: e.target,
        d: `M${p1.x},${p1.y} C${p1.x + off},${p1.y} ${p2.x - off},${p2.y} ${p2.x},${p2.y}` })
    }
    return { adj, paths }
  }, [edges, placed])

  // dopasuj widok do zawartości (na starcie i przy zmianie danych / głębokości)
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const cw = el.clientWidth, ch = el.clientHeight
    const bw = box.maxX - box.minX, bh = box.maxY - box.minY
    const pad = 90
    const nk = Math.min((cw - pad) / bw, (ch - pad) / bh, 1.1)
    setK(nk); setVx((cw - bw * nk) / 2 - box.minX * nk); setVy((ch - bh * nk) / 2 - box.minY * nk)
  }, [box])

  const onWheel = (e: React.WheelEvent) => {
    const el = wrapRef.current; if (!el) return
    const rect = el.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const nk = Math.min(2.5, Math.max(0.12, k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
    setVx(mx - (mx - vx) * (nk / k)); setVy(my - (my - vy) * (nk / k)); setK(nk)
  }
  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, vx, vy } }
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return
    setVx(drag.current.vx + (e.clientX - drag.current.x)); setVy(drag.current.vy + (e.clientY - drag.current.y))
  }
  const endDrag = () => { drag.current = null }

  const active = hover
  const dim = (p: string) => active != null && p !== active && !adj.get(active)?.has(p)
  const edgeOn = (a: string, b: string) => active != null && (a === active || b === active)

  return (
    <div ref={wrapRef} className="h-full w-full cursor-grab select-none overflow-hidden active:cursor-grabbing"
      onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
      <svg width="100%" height="100%">
        <defs>
          <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        <g transform={`translate(${vx},${vy}) scale(${k})`}>
          {paths.map((p) => {
            const on = edgeOn(p.a, p.b)
            return <path key={p.id} d={p.d} fill="none" stroke={p.color} strokeWidth={on ? 2.4 : 1.2}
              strokeOpacity={active == null ? 0.26 : on ? 0.95 : 0.05} markerEnd="url(#dg-arrow)" />
          })}
          {[...placed.values()].map((pl) => (
            <g key={pl.node.path} transform={`translate(${pl.x},${pl.y})`} opacity={dim(pl.node.path) ? 0.16 : 1}
              style={{ cursor: pl.isCenter ? 'default' : 'pointer' }}
              onMouseEnter={() => setHover(pl.node.path)} onMouseLeave={() => setHover(null)}
              onClick={() => { if (!pl.isCenter) onOpen(pl.node.path) }}>
              <title>{pl.node.label} · {pl.node.folder || '/'}</title>
              <rect width={W} height={H} rx={9} fill={pl.isCenter ? 'rgba(20,30,48,0.97)' : 'rgba(13,18,30,0.94)'}
                stroke={pl.isCenter ? '#7df9ff' : pl.color} strokeWidth={pl.isCenter ? 2.4 : active === pl.node.path ? 2.2 : 1.4} />
              <rect width={5} height={H} rx={2} fill={pl.color} />
              <circle cx={20} cy={H / 2} r={7} fill={pl.color} />
              <text x={20} y={H / 2} dominantBaseline="central" textAnchor="middle" fontSize={11} fill="#06121c">{pl.glyph}</text>
              <text x={36} y={H / 2} dominantBaseline="central" fontSize={13} fontWeight={pl.isCenter ? 700 : 500} fill="#eaf2fb">{truncate(pl.node.label, 23)}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
