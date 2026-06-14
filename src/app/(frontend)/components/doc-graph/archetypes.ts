// Kształt węzła zależy od typu dokumentu (frontmatter `doc-type`) — „astronomiczne" ciała.
export type Archetype = 'quasar' | 'saturn' | 'rocky' | 'flagship' | 'crystal' | 'comet' | 'nebula' | 'moon'

export function archetypeFor(docType: string | null, isCenter: boolean): Archetype {
  if (isCenter) return 'quasar' // bieżący dokument zawsze jako kwazar (centrum)
  switch (docType) {
    case 'intent-spec': return 'saturn'
    case 'requirements-notes':
    case 'requirements-index':
    case 'requirements-list': return 'rocky'
    case 'func-spec': return 'flagship'
    case 'decision-record': return 'crystal'
    case 'validation-report': return 'comet'
    case 'hypothesis-backlog': return 'nebula'
    case 'changelog':
    case 'technical-notes': return 'moon'
    default: return 'moon'
  }
}

// glif typu w etykiecie i legendzie
export const GLYPH: Record<Archetype, string> = {
  quasar: '◉', saturn: '⏀', rocky: '⬤', flagship: '✦', crystal: '◆', comet: '☄', nebula: '❋', moon: '●',
}

// klucz i18n nazwy kształtu (legenda)
export const SHAPE_I18N: Record<Archetype, string> = {
  quasar: 'graph.shapeQuasar', saturn: 'graph.shapeSaturn', rocky: 'graph.shapeRocky',
  flagship: 'graph.shapeFlagship', crystal: 'graph.shapeCrystal', comet: 'graph.shapeComet',
  nebula: 'graph.shapeNebula', moon: 'graph.shapeMoon',
}

// kolejność i zestaw kształtów pokazywanych w legendzie
export const LEGEND_SHAPES: Archetype[] = ['quasar', 'flagship', 'saturn', 'rocky', 'crystal', 'comet', 'nebula', 'moon']
