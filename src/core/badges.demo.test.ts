/**
 * Les données de démo sont scénarisées pour débloquer quelques badges :
 * 🚀 Remontada pour Arthus ; 🧘 Zen absolu, 🏋️ Machine, 📅 Assidu·e et 🪶 Plume
 * (premier palier) pour Laetitia. On vérifie que computeBadges le voit bien.
 */
import { describe, expect, it } from 'vitest'
import { DemoSource } from '../data/demo/DemoSource'
import { generateDemoState } from '../data/demo/generate'
import { computeBadges, type BadgeId, type BadgeState } from './badges'
import { addDays, weekStartOf } from './dates'
import { buildSeason } from './season'

/** Construit un snapshot comme le ferait DemoSource, sans navigateur. */
function demoFor(today: string, meId: 'arthus' | 'laetitia') {
  const state = generateDemoState(today, today, meId)
  const src = Object.create(DemoSource.prototype) as DemoSource
  ;(src as unknown as { state: unknown }).state = state
  const snapshot = (src as unknown as { buildSnapshot(): ReturnType<DemoSource['getSnapshot']> }).buildSnapshot()
  const season = buildSeason(snapshot, today)
  const badges = (playerId: string) =>
    Object.fromEntries(computeBadges(playerId, snapshot, season, today).map((b) => [b.id, b])) as Record<BadgeId, BadgeState>
  return { season, arthus: badges('arthus'), laetitia: badges('laetitia') }
}

describe('badges sur les données de démo', () => {
  const monday = '2026-11-16'
  for (let i = 0; i < 7; i++) {
    const today = addDays(monday, i)
    for (const meId of ['arthus', 'laetitia'] as const) {
      it(`${today}, connecté·e en tant que ${meId}`, () => {
        const { season, arthus, laetitia } = demoFor(today, meId)
        const [w1, w2, w3] = season.finished.map((w) => w.weekStart)
        expect(w1).toBe(addDays(weekStartOf(today), -21))

        // 🚀 Arthus : mené le jeudi de la manche 2, puis vainqueur.
        expect(arthus.remontada).toMatchObject({ unlocked: true, unlockedOn: addDays(w2, 6) })
        // 👑 personne (L, A, L).
        expect(arthus.royale.unlocked).toBe(false)
        expect(laetitia.royale).toMatchObject({ unlocked: false, progress: { current: 1, target: 3 } })

        // 🧘 Laetitia : 9 jours nickel sur le grattage (manches 2 et 3).
        expect(laetitia.zen).toMatchObject({ applicable: true, unlocked: true })
        expect(laetitia.zen.unlockedOn! >= addDays(w2, 3)).toBe(true)
        expect(laetitia.zen.unlockedOn! <= addDays(w3, 4)).toBe(true)
        expect(arthus.zen.applicable).toBe(false)
        expect(laetitia.manucure.applicable).toBe(false)

        // 🏋️ Laetitia : sport du lundi au vendredi de la manche 3.
        expect(laetitia.machine).toMatchObject({ unlocked: true })
        expect(laetitia.machine.unlockedOn! <= addDays(w3, 4)).toBe(true)

        // 📅 Les deux : aucun jour oublié en manche 3.
        expect(laetitia.assidu.unlocked).toBe(true)
        expect(arthus.assidu.unlocked).toBe(true)

        // 🪶 Laetitia : premier palier (−2 %) à la pesée de la manche 3, pas encore −5 %.
        expect(laetitia.plume.unlocked).toBe(true)
        expect(laetitia.plume.tiers?.[0].unlockedOn).toBe(addDays(w3, 6))
        expect(laetitia.plume.tiers?.[1].unlockedOn).toBeNull()
        expect(laetitia.plume.count).toBe(1)

        // 🔥 Inarrêtable : impossible en moins de 30 jours de duel.
        expect(laetitia.inarretable.unlocked).toBe(false)
        expect(arthus.inarretable.unlocked).toBe(false)

        // Cohérence : progression ≤ objectif, débloqué ⇔ date.
        for (const b of [...Object.values(arthus), ...Object.values(laetitia)]) {
          expect(b.progress.current).toBeLessThanOrEqual(b.progress.target)
          expect(b.progress.current).toBeGreaterThanOrEqual(0)
          expect(b.unlocked).toBe(b.unlockedOn !== null)
          if (b.unlocked) expect(b.unlockedOn! <= today).toBe(true)
        }
      })
    }
  }
})
