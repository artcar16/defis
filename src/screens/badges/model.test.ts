import { describe, expect, it } from 'vitest'
import { BADGES, type BadgeId, type BadgeState } from '../../core/badges'
import { typo } from '../../core/fr'
import { bragLine, HOW_TO, notApplicableText, progressCaption, progressText, remainingText, showcaseLine, unlockedLabel } from './copy'
import { closestBadge, FIRST_VISIT_KEY, firstVisitKeys, galleryOrder, pendingUnlocks, showcaseCount, unlockEvents } from './model'

/** Compare sans se soucier des espaces insécables. */
const flat = (s: string | undefined) => (s ?? '').replace(/\u00a0/g, ' ')

function badge(id: BadgeId, patch: Partial<BadgeState> = {}): BadgeState {
  const def = BADGES.find((b) => b.id === id)!
  return {
    ...def,
    applicable: true,
    unlocked: false,
    unlockedOn: null,
    unlockDays: patch.unlockedOn ? [patch.unlockedOn] : [],
    progress: { current: 0, target: 7 },
    count: 0,
    ...patch,
  }
}

describe('galerie de badges', () => {
  it('met les badges « pas concerné·e » à la fin et ne les compte pas', () => {
    const list = [badge('manucure', { applicable: false }), badge('zen', { unlocked: true, unlockedOn: '2026-11-10' }), badge('frigo')]
    expect(galleryOrder(list).map((b) => b.id)).toEqual(['zen', 'frigo', 'manucure'])
    expect(showcaseCount(list)).toEqual({ unlocked: 1, total: 2 })
  })

  it('choisit le badge verrouillé le plus avancé (hors 🚀 et 🪶)', () => {
    const list = [
      badge('frigo', { progress: { current: 2, target: 7 } }),
      badge('royale', { progress: { current: 2, target: 3 } }),
      badge('plume', { progress: { current: 19, target: 20 }, tiers: [{ label: '−2 %', pct: 2, unlockedOn: null }] }),
      badge('remontada', { progress: { current: 0, target: 1 } }),
    ]
    expect(closestBadge(list)?.id).toBe('royale')
    expect(closestBadge([badge('frigo')])).toBeNull()
  })

  it('crée un évènement par badge, et par palier pour 🪶, du plus ancien au plus récent', () => {
    const list = [
      badge('remontada', { unlocked: true, unlockedOn: '2026-11-08', progress: { current: 1, target: 1 }, count: 1 }),
      badge('plume', {
        unlocked: true,
        unlockedOn: '2026-11-01',
        count: 2,
        tiers: [
          { label: '−2 %', pct: 2, unlockedOn: '2026-11-01' },
          { label: '−5 %', pct: 5, unlockedOn: '2026-11-15' },
          { label: '−10 %', pct: 10, unlockedOn: null },
        ],
      }),
      badge('zen', { applicable: false }),
    ]
    expect(unlockEvents(list).map((e) => [e.key, e.on])).toEqual([
      ['plume:2', '2026-11-01'],
      ['remontada', '2026-11-08'],
      ['plume:5', '2026-11-15'],
    ])
  })
})

describe('cérémonies déjà vues', () => {
  const list = [
    badge('assidu', { unlocked: true, unlockedOn: '2026-11-01', count: 1 }),
    badge('zen', { unlocked: true, unlockedOn: '2026-11-15', count: 1 }),
  ]
  const events = unlockEvents(list)

  it('à la toute première visite, les déblocages de plus de 3 jours comptent comme vus', () => {
    expect(firstVisitKeys(events, '2026-11-16')).toEqual([FIRST_VISIT_KEY, 'assidu'])
    expect(pendingUnlocks(events, [], '2026-11-16').map((e) => e.key)).toEqual(['zen'])
  })

  it('ensuite, seules les clés enregistrées par la source comptent', () => {
    // Une fois le repère posé, un vieux déblocage pas encore fêté se fête quand même.
    expect(pendingUnlocks(events, [FIRST_VISIT_KEY], '2026-11-16').map((e) => e.key)).toEqual(['assidu', 'zen'])
    expect(pendingUnlocks(events, [FIRST_VISIT_KEY, 'assidu', 'zen'], '2026-11-16')).toEqual([])
  })

  it('pose le repère même sans aucun badge', () => {
    expect(firstVisitKeys([], '2026-11-16')).toEqual([FIRST_VISIT_KEY])
  })
})

describe('textes', () => {
  it('formate la progression et les dates', () => {
    expect(progressText(badge('frigo', { progress: { current: 4, target: 7 } }))).toEqual({ value: '4 / 7', unit: 'jours' })
    expect(flat(progressText(badge('plume', { progress: { current: 14, target: 20 } }))?.value)).toBe('−1,4 % / −2 %')
    expect(flat(progressText(badge('plume', { progress: { current: 0, target: 20 } }))?.value)).toBe('0 % / −2 %')
    expect(progressText(badge('royale', { progress: { current: 1, target: 1 } }))?.unit).toBe('manche')
    expect(progressText(badge('remontada'))).toBeNull()
    expect(flat(unlockedLabel('2026-11-16', '2026-11-16'))).toBe('Débloqué aujourd’hui 🎉')
    expect(flat(unlockedLabel('2026-11-15', '2026-11-16'))).toBe('Débloqué hier')
    expect(flat(unlockedLabel('2026-11-12', '2026-11-16'))).toBe('Débloqué le 12 nov.')
    expect(flat(unlockedLabel('2026-11-01', '2026-11-16'))).toBe('Débloqué le 1er nov.')
    expect(flat(unlockedLabel('2026-11-01', '2026-11-16', true))).toBe('Débloqué le 1er novembre')
    // Le jour et le mois restent ensemble en fin de ligne.
    expect(unlockedLabel('2026-11-01', '2026-11-16', true)).toBe('Débloqué le 1er\u00a0novembre')
  })

  it('encourage le bon joueur', () => {
    const b = badge('frigo', { progress: { current: 2, target: 7 } })
    expect(flat(remainingText(b, null))).toBe('Encore 5 jours « Nickel » d’affilée 💪')
    expect(flat(remainingText(b, 'Laetitia'))).toBe('Encore 5 jours « Nickel » d’affilée pour Laetitia 👀')
    expect(flat(remainingText(badge('frigo', { progress: { current: 6, target: 7 } }), null))).toBe('Encore 1 jour « Nickel » d’affilée 💪')
  })

  it('élide devant un prénom qui commence par une voyelle', () => {
    expect(flat(remainingText(badge('zen'), 'Arthus'))).toBe('La série d’Arthus démarre au prochain « 😇 Nickel » 👀')
    expect(flat(remainingText(badge('zen'), 'Laetitia'))).toBe('La série de Laetitia démarre au prochain « 😇 Nickel » 👀')
    const plume = badge('plume', { tiers: [{ label: '−2 %', pct: 2, unlockedOn: null }] })
    expect(flat(remainingText(plume, 'Arthus'))).toBe('Prochain palier d’Arthus : −2 % 👀')
  })

  it('🏋️ Machine : « plus assez de jours » d’après les séances encore jouables', () => {
    // Vendredi, sport fait lundi et vendredi : 2 / 5, il reste samedi et dimanche.
    const short = badge('machine', { progress: { current: 2, target: 5, possible: 2 } })
    expect(flat(remainingText(short, null))).toBe('Plus assez de jours cette manche… rendez-vous lundi 😅')
    expect(flat(remainingText(short, 'Arthus'))).toBe('Plus assez de jours pour Arthus cette manche… rendez-vous lundi 👀')
    // Pile assez : encore jouable.
    const tight = badge('machine', { progress: { current: 3, target: 5, possible: 2 } })
    expect(flat(remainingText(tight, null))).toBe('Encore 2 séances de sport cette manche 🏋️')
    expect(flat(remainingText(badge('machine', { progress: { current: 4, target: 5, possible: 3 } }), null))).toBe(
      'Encore 1 séance de sport cette manche 🏋️',
    )
  })

  it('compare les vitrines sans méchanceté', () => {
    expect(flat(showcaseLine('Arthus', 4, 3))).toContain('1 badge d’avance sur Arthus')
    expect(flat(showcaseLine('Arthus', 1, 3))).toContain('Arthus a 2 badges d’avance')
    expect(showcaseLine('Arthus', 2, 2)).toContain('Égalité')
  })

  it('respecte la typographie française dans tous les textes', () => {
    const texts: string[] = [
      ...Object.values(HOW_TO),
      ...BADGES.flatMap((d) => [
        progressCaption(d.id),
        bragLine(d.id, 'Arthus'),
        notApplicableText(d.id, null),
        notApplicableText(d.id, 'Arthus'),
        ...[null, 'Arthus', 'Laetitia'].flatMap((who) => [
          remainingText(badge(d.id, { progress: { current: 0, target: 7 } }), who),
          remainingText(badge(d.id, { progress: { current: 3, target: 7, possible: 1 } }), who),
          remainingText(badge(d.id, { progress: { current: 3, target: 7, possible: 6 } }), who),
        ]),
      ]),
      ...[0, 1, 2, 5].flatMap((n) => [showcaseLine('Arthus', n, 2), showcaseLine('Laetitia', 2, n)]),
    ]
    for (const t of texts) {
      expect(t, t).toBe(typo(t))
      expect(t, t).not.toMatch(/[ ][!?:;»%]|«[ ]|'|\b(de|que) [AEIOUÉ]/)
      expect(t, t).not.toMatch(/\b(0|1)[ \u00a0](jours|séances|badges|manches|victoires|pts)\b/)
    }
  })
})
