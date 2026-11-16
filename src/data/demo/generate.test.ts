import { describe, expect, it } from 'vitest'
import { addDays, weekStartOf } from '../../core/dates'
import { dailyScore, indexCheckins } from '../../core/scoring'
import { buildSeason } from '../../core/season'
import { drawStake } from '../../core/stake'
import { DemoSource } from './DemoSource'
import { demoTravelDays, generateDayCheckins, generateDemoState, lastHabitOf, scenarioWeek } from './generate'

const REAL_MONDAY = '2026-11-16'
/** Horloge fixe : le lundi 16 novembre 2026, midi à Paris. */
const clock = () => new Date('2026-11-16T11:00:00Z')

/** Le snapshot tel que DemoSource le donne au joueur connecté (sans navigateur). */
function demoFor(today: string, meId: 'arthus' | 'laetitia' = 'arthus') {
  const src = new DemoSource({ search: `?reset=1&as=${meId}&day=${today}`, clock, persist: false })
  const snapshot = src.getSnapshot()
  return { snapshot, season: buildSeason(snapshot, today) }
}

describe('données de démo', () => {
  for (const today of demoTravelDays(REAL_MONDAY)) {
    it(`respecte le scénario des 3 manches (aujourd'hui = ${today})`, () => {
      const { season, snapshot } = demoFor(today)
      // Le lundi suivant, la vraie semaine (manche 4) est terminée à son tour.
      const nextMonday = today === addDays(REAL_MONDAY, 7)
      expect(season.finished).toHaveLength(nextMonday ? 4 : 3)
      expect(season.current.weekStart).toBe(weekStartOf(today))
      const [w1, w2, w3] = season.finished
      expect(w1.weekStart).toBe(addDays(REAL_MONDAY, -21))
      expect(w1.outcome.winnerId).toBe('laetitia')
      expect(w2.outcome.winnerId).toBe('arthus')
      expect(w3.outcome.winnerId).toBe('laetitia')
      // Kilos de l'autre masqués, les miens visibles.
      expect(snapshot.weighIns.filter((w) => w.playerId === 'laetitia').every((w) => w.weightKg === null)).toBe(true)
      expect(snapshot.weighIns.filter((w) => w.playerId === 'arthus').every((w) => w.weightKg !== null)).toBe(true)
      // Toute manche commencée a son enjeu (tirage automatique du lundi).
      for (const w of season.weeks) expect(w.meta?.stake).toBeTruthy()
      const prevStake = season.weeks.find((w) => w.weekStart < season.current.weekStart && w.index === season.current.index - 1)?.meta?.stake ?? null
      expect(season.current.meta?.stake).toBe(drawStake(snapshot.settings.gages, season.current.weekStart, prevStake))
    })
  }

  it('cale le scénario sur la vraie semaine, lundi suivant compris', () => {
    expect(scenarioWeek('2026-11-19', REAL_MONDAY)).toBe(REAL_MONDAY)
    expect(scenarioWeek('2026-11-23', REAL_MONDAY)).toBe(REAL_MONDAY)
    expect(scenarioWeek('2026-11-30', REAL_MONDAY)).toBe('2026-11-30')
    expect(demoTravelDays('2026-11-19')).toEqual([...Array.from({ length: 7 }, (_, i) => addDays(REAL_MONDAY, i)), '2026-11-23'])
  })

  it('invente toujours les mêmes jours, quel que soit le jour simulé ou le joueur connecté', () => {
    const a = generateDemoState('2026-11-16', REAL_MONDAY, 'arthus')
    const b = generateDemoState('2026-11-21', REAL_MONDAY, 'laetitia')
    const past = (s: typeof a) =>
      s.checkins
        .filter((c) => c.day < REAL_MONDAY)
        .map((c) => `${c.playerId}|${c.habitId}|${c.day}|${c.value}`)
        .sort()
    expect(past(b)).toEqual(past(a))
    const habits = a.habits
    expect(generateDayCheckins(habits, 'arthus', '2026-11-18')).toEqual(generateDayCheckins(habits, 'arthus', '2026-11-18'))
  })

  it('laisse ma dernière habitude d’hier vide (rattrapage) quand hier est dans la manche en cours', () => {
    const s = generateDemoState('2026-11-18', REAL_MONDAY, 'arthus')
    const index = indexCheckins(s.checkins)
    const yesterday = '2026-11-17'
    const mine = dailyScore('arthus', yesterday, s.habits, index)
    expect(mine.filled).toBe(mine.total - 1)
    expect(index.has(`arthus|${lastHabitOf(s.habits, 'arthus', yesterday)!.id}|${yesterday}`)).toBe(false)
    // L'autre : hier complet, aujourd'hui vide.
    expect(dailyScore('laetitia', yesterday, s.habits, index).complete).toBe(true)
    expect(dailyScore('laetitia', '2026-11-18', s.habits, index).filled).toBe(0)
    // Le lundi, hier (dimanche) appartient à la manche close : il est complet.
    const monday = generateDemoState(REAL_MONDAY, REAL_MONDAY, 'arthus')
    expect(dailyScore('arthus', '2026-11-15', monday.habits, indexCheckins(monday.checkins)).complete).toBe(true)
  })

  it('le jour de la pesée, l’autre s’est déjà pesé ce matin', () => {
    const s = generateDemoState('2026-11-22', REAL_MONDAY, 'arthus')
    expect(s.weighIns.some((w) => w.playerId === 'laetitia' && w.day === '2026-11-22')).toBe(true)
    expect(s.weighIns.some((w) => w.playerId === 'arthus' && w.day === '2026-11-22')).toBe(false)
    expect(s.morningWeighIn).toEqual({ playerId: 'laetitia', day: '2026-11-22' })
    // Le lundi suivant : les deux pesées du dimanche existent, plus de « pesée du matin ».
    const next = generateDemoState('2026-11-23', REAL_MONDAY, 'arthus')
    expect(next.weighIns.filter((w) => w.day === '2026-11-22').map((w) => w.playerId).sort()).toEqual(['arthus', 'laetitia'])
    expect(next.morningWeighIn).toBeNull()
  })
})
