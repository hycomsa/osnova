// Predefiniowane „skille" do wcielania/refiningu komentarzy — żeby użytkownik nie musiał
// sam pisać promptu, tylko wybrał gotowy tryb. To zarazem ogólna pula kopiowana na workspace
// przy jego tworzeniu (ws-admin może je potem edytować/wyłączać/dodawać własne).

export type SkillCategory = 'apply' | 'refine'

export interface SkillDef {
  key: string
  name: string
  description: string
  category: SkillCategory
  instruction: string
}

export const DEFAULT_SKILLS: SkillDef[] = [
  {
    key: 'apply-verbatim',
    name: 'Wciel uwagi 1:1',
    description: 'Nanieś dokładnie to, o co proszą uwagi — minimalne zmiany w pozostałej treści.',
    category: 'apply',
    instruction: 'Nanieś dokładnie zmiany wskazane w uwagach, jak najmniej ingerując w resztę dokumentu. Nie zmieniaj tonu ani stylu poza tym, czego wprost wymaga uwaga.',
  },
  {
    key: 'apply-tone',
    name: 'Wciel i ujednolić ton',
    description: 'Nanieś uwagi i dostosuj styl/ton wprowadzanych fragmentów do reszty dokumentu.',
    category: 'apply',
    instruction: 'Wcielając uwagi, dostosuj ton i styl wprowadzanych fragmentów do reszty dokumentu, dbając o spójność stylistyczną i terminologiczną.',
  },
  {
    key: 'apply-concise',
    name: 'Wciel i skróć',
    description: 'Nanieś uwagi i sformułuj zmieniane fragmenty zwięźle, bez utraty treści.',
    category: 'apply',
    instruction: 'Wcielając uwagi, formułuj zmieniane fragmenty zwięźle — usuwaj zbędne słowa i powtórzenia, zachowując pełną treść merytoryczną.',
  },
  {
    key: 'refine-language',
    name: 'Popraw język wg uwag',
    description: 'Wciel uwagi i przy okazji popraw gramatykę, interpunkcję i klarowność.',
    category: 'refine',
    instruction: 'Wcielając uwagi, popraw też gramatykę, interpunkcję, literówki i klarowność zdań w zmienianych fragmentach. Zachowaj sens, terminologię i język oryginału.',
  },
  {
    key: 'refine-structure',
    name: 'Uporządkuj strukturę wg uwag',
    description: 'Wciel uwagi dotyczące struktury — nagłówki, listy, kolejność sekcji.',
    category: 'refine',
    instruction: 'Wcielając uwagi dotyczące struktury, uporządkuj nagłówki, listy i kolejność sekcji w obrębie zmienianych miejsc. Nie usuwaj treści niezwiązanej z uwagami.',
  },
]

export function defaultSkillByKey(key: string): SkillDef | undefined {
  return DEFAULT_SKILLS.find((s) => s.key === key)
}
