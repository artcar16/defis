import { describe, expect, it } from 'vitest'
import { BADGES, type BadgeId, type BadgeState } from '../../core/badges'
import { progressText, remainingText, showcaseLine, unlockedLabel } from './copy'
import { closestBadge, galleryOrder, showcaseCount, unlockEvents } from './model'

function badge(id: BadgeId, patch: Partial<BadgeState> = {}): BadgeState {
  const def = BADGES.find((b) => b.id === id)!
  return {
    ...def,
    applicable: true,
    unlocked: false,
    unlockedOn: null,
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

describe('textes', () => {
  it('formate la progression et les dates', () => {
    expect(progressText(badge('frigo', { progress: { current: 4, target: 7 } }))).toEqual({ value: '4 / 7', unit: 'jours' })
    expect(progressText(badge('plume', { progress: { current: 14, target: 20 } }))?.value).toBe('−1,4 % / −2 %')
    expect(progressText(badge('remontada'))).toBeNull()
    expect(unlockedLabel('2026-11-16', '2026-11-16')).toBe('Débloqué aujourd’hui 🎉')
    expect(unlockedLabel('2026-11-15', '2026-11-16')).toBe('Débloqué hier')
    expect(unlockedLabel('2026-11-12', '2026-11-16')).toBe('Débloqué le 12 nov.')
  })

  it('encourage le bon joueur', () => {
    const b = badge('frigo', { progress: { current: 2, target: 7 } })
    expect(remainingText(b, null, 5)).toBe('Encore 5 jours « Nickel » d’affilée 💪')
    expect(remainingText(b, 'Laetitia', 5)).toBe('Encore 5 jours « Nickel » d’affilée pour Laetitia 👀')
    const machine = badge('machine', { progress: { current: 1, target: 5 } })
    expect(remainingText(machine, null, 2)).toContain('rendez-vous lundi')
  })

  it('compare les vitrines sans méchanceté', () => {
    expect(showcaseLine('Arthus', 4, 3)).toContain('1 badge d’avance sur Arthus')
    expect(showcaseLine('Arthus', 1, 3)).toContain('Arthus a 2 badges d’avance')
    expect(showcaseLine('Arthus', 2, 2)).toContain('Égalité')
  })
})
