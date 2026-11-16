import { describe, expect, it } from 'vitest'
import { addDays, weekStartOf } from '../../core/dates'
import { buildSeason } from '../../core/season'
import { DemoSource } from './DemoSource'
import { generateDemoState } from './generate'

// Construit un snapshot comme le ferait DemoSource, sans navigateur.
function seasonFor(today: string) {
  const state = generateDemoState(today, today, 'arthus')
  const src = Object.create(DemoSource.prototype) as DemoSource
  ;(src as unknown as { state: unknown }).state = state
  const snapshot = (src as unknown as { buildSnapshot(): ReturnType<DemoSource['getSnapshot']> }).buildSnapshot()
  return { state, snapshot, season: buildSeason(snapshot, today) }
}

describe('données de démo', () => {
  const monday = '2026-11-16'
  for (let i = 0; i < 7; i++) {
    const today = addDays(monday, i)
    it(`respecte le scénario des 3 manches (aujourd'hui = ${today})`, () => {
      const { season, snapshot } = seasonFor(today)
      expect(season.finished).toHaveLength(3)
      expect(season.current.weekStart).toBe(weekStartOf(today))
      const [w1, w2, w3] = season.finished
      expect(w1.outcome.winnerId).toBe('laetitia')
      expect(w2.outcome.winnerId).toBe('arthus')
      expect(w3.outcome.winnerId).toBe('laetitia')
      expect(season.record.wins).toEqual({ laetitia: 2, arthus: 1 })
      // Kilos de l'autre masqués, les miens visibles.
      expect(snapshot.weighIns.filter((w) => w.playerId === 'laetitia').every((w) => w.weightKg === null)).toBe(true)
      expect(snapshot.weighIns.filter((w) => w.playerId === 'arthus').every((w) => w.weightKg !== null)).toBe(true)
    })
  }
})
