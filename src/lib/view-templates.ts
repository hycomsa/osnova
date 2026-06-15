// Default view templates used to pre-fill the workspace creator (and the seed), so a new
// workspace gets sensible client views without hand-defining globs. Tuned for the AI-SDLC
// `.ai/context/...` repo layout; for other layouts the creator lets you edit/replace them.

const BUSINESS_INCLUDE = [
  '.ai/context/README.md',
  '.ai/context/state.md',
  '.ai/context/project-config.md',
  '.ai/context/intent-specs/**',
  '.ai/context/requirements/**',
  '.ai/context/func-specs/**',
]

const TECHNICAL_INCLUDE = [
  ...BUSINESS_INCLUDE,
  '.ai/context/adrs/**',
  '.ai/context/specs/**',
  '.ai/context/references/**',
  '.ai/context/environments/**',
  '.ai/context/mockups/**',
]

// Hidden by default in client views (technical noise); paired with hideUnderscored for `_*` dirs.
export const DEFAULT_VIEW_EXCLUDE = ['.ai/context/_input/**', '**/changelog.md']

export interface ViewTemplate {
  include: string[]
  hideUnderscored: boolean
  showMetadata: boolean
}

// showMetadata=false: frontmatter pokazujemy w dedykowanym panelu „Właściwości", a nie jako
// tabelę wstrzykniętą na górę treści (to robi `showMetadata=true`).
export const DEFAULT_VIEW_TEMPLATES: Record<'client_business' | 'client_technical', ViewTemplate> = {
  client_business: { include: BUSINESS_INCLUDE, hideUnderscored: true, showMetadata: false },
  client_technical: { include: TECHNICAL_INCLUDE, hideUnderscored: true, showMetadata: false },
}
