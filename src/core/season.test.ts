import { describe, expect, it } from 'vitest'
import { addDays, dayKeyAt, weekEndOf } from './dates'
import { buildSeason, isStakeEditable, pendingResultsWeek, seasonRecord } from './season'
import { A, L, START, defaultHabits, fillPlayer, makeSnapshot, weekOf } from './test-helpers'
import type { Checkin } from './types'

const habits = defaultHabits()
const W1 = weekOf(1) // 26/10
const W2 = weekOf(2) // 02/11
const W3 = weekOf(3) // 09/11
const W4 = weekOf(4) // 16/11

/** Le joueur gagne la manche en faisant tout parfait (l'autre ne fait rien). */
const win = (player: string, ws: string): Checkin[] => fillPlayer(habits, player, ws, weekEndOf(ws))
/** Les deux font une semaine parfaite : égalité. */
const tie = (ws: string): Checkin[] => [...win(A, ws), ...win(L, ws)]

describe('buildSeason', () => {
  it('avant le premier lundi : duel pas commencé, une seule manche vide', () => {
    const season = buildSeason(makeSnapshot(), addDays(START, -3))
    expect(season.notStarted).toBe(true)
    expect(season.weeks).toHaveLength(1)
    expect(season.current.weekStart).toBe(START)
    expect(season.current.finished).toBe(false)
    expect(season.current.daysLeft).toBe(7)
    expect(season.finished).toEqual([])
    expect(season.record).toMatchObject({ played: 0, ties: 0, streak: { playerId: null, count: 0 } })
  })

  it('le premier lundi : la manche 1 commence', () => {
    const season = buildSeason(makeSnapshot(), START)
    expect(season.notStarted).toBe(false)
    expect(season.current).toMatchObject({ weekStart: START, weekEnd: addDays(START, 6), index: 1, daysLeft: 7, finished: false })
  })

  it('jours restants : aujourd’hui compte (jeudi = 4, dimanche = 1)', () => {
    expect(buildSeason(makeSnapshot(), addDays(W4, 3)).current.daysLeft).toBe(4)
    expect(buildSeason(makeSnapshot(), addDays(W4, 6)).current.daysLeft).toBe(1)
  })

  it('manches numérotées, terminées et en cours', () => {
    const season = buildSeason(makeSnapshot(), addDays(W4, 2))
    expect(season.weeks.map((w) => [w.weekStart, w.index, w.finished])).toEqual([
      [W1, 1, true],
      [W2, 2, true],
      [W3, 3, true],
      [W4, 4, false],
    ])
    expect(season.finished).toHaveLength(3)
    expect(season.current.weekStart).toBe(W4)
    expect(season.weeks.filter((w) => w.finished).every((w) => w.daysLeft === 0)).toBe(true)
  })

  it('la manche en cours ne compte que jusqu’à aujourd’hui', () => {
    const checkins = win(A, W4) // même des jours « futurs » (données incohérentes) ne comptent pas
    const season = buildSeason(makeSnapshot({ checkins }), addDays(W4, 1))
    expect(season.current.scores[A].daysTotal).toBe(200)
    expect(season.current.outcome).toMatchObject({ winnerId: A, gap: 200, tie: false })
  })

  it('gagnants, égalités et bilan global', () => {
    const checkins = [...win(L, W1), ...win(A, W2), ...tie(W3)]
    const season = buildSeason(makeSnapshot({ checkins }), addDays(W4, 0))
    const [w1, w2, w3] = season.finished
    expect(w1.outcome).toMatchObject({ winnerId: L, gageFor: [A], tie: false, gap: 700 })
    expect(w2.outcome).toMatchObject({ winnerId: A, gageFor: [L] })
    expect(w3.outcome).toMatchObject({ winnerId: null, tie: true })
    expect(w3.outcome.gageFor.sort()).toEqual([A, L])
    expect(season.record).toEqual({ wins: { [L]: 1, [A]: 1 }, ties: 1, played: 3, streak: { playerId: null, count: 0 } })
  })

  it('série de victoires en cours', () => {
    const checkins = [...win(A, W1), ...win(L, W2), ...win(L, W3)]
    const season = buildSeason(makeSnapshot({ checkins }), W4)
    expect(season.record.streak).toEqual({ playerId: L, count: 2 })
    expect(season.record.wins).toEqual({ [L]: 2, [A]: 1 })
  })

  it('une égalité casse la série', () => {
    const record = seasonRecord(
      [A, L],
      buildSeason(makeSnapshot({ checkins: [...win(A, W1), ...win(A, W2), ...tie(W3)] }), W4).finished,
    )
    expect(record.streak).toEqual({ playerId: null, count: 0 })
    expect(record.wins[A]).toBe(2)
  })

  it('passage d’une manche à l’autre : dimanche 23:59 → lundi 00:00 (Paris)', () => {
    const checkins = win(L, W1)
    const sunday = dayKeyAt(new Date('2026-11-01T22:59:59Z')) // dimanche 1er nov., 23:59:59 à Paris
    const monday = dayKeyAt(new Date('2026-11-01T23:00:00Z')) // lundi 2 nov., 00:00 à Paris
    expect([sunday, monday]).toEqual(['2026-11-01', '2026-11-02'])

    const before = buildSeason(makeSnapshot({ checkins }), sunday)
    expect(before.finished).toHaveLength(0)
    expect(before.current.weekStart).toBe(W1)
    expect(before.current.daysLeft).toBe(1)
    expect(pendingResultsWeek(before, [])).toBeNull()

    const after = buildSeason(makeSnapshot({ checkins }), monday)
    expect(after.finished).toHaveLength(1)
    expect(after.finished[0].outcome.winnerId).toBe(L)
    expect(after.current.weekStart).toBe(W2)
    expect(after.current.daysLeft).toBe(7)
    expect(after.record.wins[L]).toBe(1)
    expect(pendingResultsWeek(after, [])?.weekStart).toBe(W1)
  })

  it('les métadonnées de la manche (enjeu, gage payé) sont rattachées', () => {
    const snap = makeSnapshot()
    snap.weeks = [{ weekStart: W2, stake: 'Massage 💆', gagePaid: { [A]: true } }]
    const season = buildSeason(snap, W3)
    expect(season.weeks[1].meta).toEqual({ weekStart: W2, stake: 'Massage 💆', gagePaid: { [A]: true } })
    expect(season.weeks[0].meta).toBeNull()
  })
})

describe('pendingResultsWeek (cérémonie)', () => {
  it('la dernière manche terminée, si pas encore vue', () => {
    const season = buildSeason(makeSnapshot({ checkins: win(A, W1) }), addDays(W3, 2))
    expect(pendingResultsWeek(season, [])?.weekStart).toBe(W2)
    expect(pendingResultsWeek(season, [W1])?.weekStart).toBe(W2)
    expect(pendingResultsWeek(season, [W2])).toBeNull()
  })
  it('rien avant la fin de la première manche', () => {
    expect(pendingResultsWeek(buildSeason(makeSnapshot(), addDays(W1, 6)), [])).toBeNull()
  })
  it('plus tard si on n’ouvre pas l’app le lundi', () => {
    const season = buildSeason(makeSnapshot(), addDays(W2, 4))
    expect(pendingResultsWeek(season, [])?.weekStart).toBe(W1)
  })
})

describe('isStakeEditable (enjeu modifiable le lundi seulement)', () => {
  it('lundi oui, mardi non', () => {
    expect(isStakeEditable(W4, W4)).toBe(true)
    expect(isStakeEditable(W4, addDays(W4, 1))).toBe(false)
    expect(isStakeEditable(W4, addDays(W4, 6))).toBe(false)
  })
  it('ni une manche passée, ni une manche future', () => {
    expect(isStakeEditable(W3, W4)).toBe(false)
    expect(isStakeEditable(W4, addDays(W4, -1))).toBe(false)
  })
})
