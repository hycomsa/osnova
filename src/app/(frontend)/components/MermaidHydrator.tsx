'use client'

import { useEffect } from 'react'

export function MermaidHydrator({ trigger }: { trigger: unknown }) {
  useEffect(() => {
    let cancelled = false
    import('mermaid').then(({ default: mermaid }) => {
      if (cancelled) return
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
      mermaid.run({ querySelector: 'code.mermaid' }).catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [trigger])
  return null
}
