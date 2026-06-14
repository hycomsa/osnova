import { NextResponse } from 'next/server'
import { PushConflict, WriteConflict } from './git/worktree'
import { AccessDenied, Conflict, NotFound } from './read-service'

export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof AccessDenied) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (e instanceof NotFound) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // konflikt zapisu z obiema wersjami — front otwiera kreator rozwiązania (FR-19a)
  if (e instanceof WriteConflict)
    return NextResponse.json({ error: 'WriteConflict', conflict: true, ...e.detail }, { status: 409 })
  if (e instanceof Conflict)
    return NextResponse.json({ error: 'Conflict', message: 'Operacja koliduje ze stanem repo (plik istnieje lub został zmieniony).' }, { status: 409 })
  if (e instanceof PushConflict)
    return NextResponse.json(
      { error: 'Conflict', message: 'Plik został w międzyczasie zmieniony zdalnie. Odśwież i nanieś zmiany ponownie.' },
      { status: 409 },
    )
  console.error('[osnova] internal error:', e)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}
