import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { indexCheckins } from './scoring'
import { checkinStreak, habitCalendar, habitStreak, isSuccess, scanStreak, type DayVerdict } from './streaks'
import { A, START, ci, defaultHabits, fill, fillPlayer, makeHabit } from './test-helpers'
import type { Checkin } from './types'

const nails = makeHabit('a-ongles', A, 'avoid', { badgeKey: 'ongles' })
const sport = makeHabit('a-sport', A, 'do', { badgeKey: 'sport' })
const d = (n: number) => addDays(START, n)

describe('isSuccess', () => {
  it('nickel et fait seulement', () => {
    expect(isSuccess('nickel')).toBe(true)
    expect(isSuccess('fait')).toBe(true)
    expect(isSuccess('unpeu')).toBe(false)
    expect(isSuccess('craquage')).toBe(false)
    expect(isSuccess('pasfait')).toBe(false)
    expect(isSuccess(null)).toBe(false)
  })
})

describe('habitStreak', () => {
  const streak = (checkins: Checkin[], today: string, habit = nails) => habitStreak(habit, indexCheckins(checkins), today)

  it('série en cours qui inclut aujourd’hui', () => {
    expect(streak(fill(nails, d(0), d(4)), d(4))).toEqual({ current: 5, record: 5, recordEnd: d(4) })
  })
  it('aujourd’hui pas encore rempli ne casse pas la série', () => {
    expect(streak(fill(nails, d(0), d(3)), d(4))).toEqual({ current: 4, record: 4, recordEnd: d(3) })
  })
  it('un jour passé non rempli casse la série (même hier)', () => {
    expect(streak(fill(nails, d(0), d(2)), d(4)).current).toBe(0)
    expect(streak([...fill(nails, d(0), d(2)), ...fill(nails, d(4), d(5))], d(5))).toEqual({ current: 2, record: 3, recordEnd: d(2) })
  })
  it('un raté aujourd’hui casse la série', () => {
    const c = [...fill(nails, d(0), d(3)), ci(A, nails.id, d(4), 'craquage')]
    expect(streak(c, d(4))).toEqual({ current: 0, record: 4, recordEnd: d(3) })
  })
  it('« un peu » casse aussi la série nickel', () => {
    const c = [...fill(nails, d(0), d(1)), ci(A, nails.id, d(2), 'unpeu'), ...fill(nails, d(3), d(3))]
    expect(streak(c, d(3))).toEqual({ current: 1, record: 2, recordEnd: d(1) })
  })
  it('record : la meilleure série, même terminée', () => {
    const c = [...fill(nails, d(0), d(6)), ci(A, nails.id, d(7), 'craquage'), ...fill(nails, d(8), d(10))]
    expect(streak(c, d(10))).toEqual({ current: 3, record: 7, recordEnd: d(6) })
  })
  it('habitude « à faire » : les jours « fait »', () => {
    const c = [...fill(sport, d(0), d(2)), ci(A, sport.id, d(3), 'pasfait'), ...fill(sport, d(4), d(5))]
    expect(streak(c, d(5), sport)).toEqual({ current: 2, record: 3, recordEnd: d(2) })
  })
  it('les jours où l’habitude est inactive sont ignorés', () => {
    // Active du 26/10 au 29/10, puis de nouveau… (simulé par deux périodes : on teste l'arrêt)
    const stopped = makeHabit('a-ongles', A, 'avoid', { activeUntil: d(3) })
    const c = fill(stopped, d(0), d(2))
    expect(streak(c, d(10), stopped)).toEqual({ current: 3, record: 3, recordEnd: d(2) })
  })
  it('rien après aujourd’hui ne compte', () => {
    expect(streak(fill(nails, d(0), d(9)), d(4))).toEqual({ current: 5, record: 5, recordEnd: d(4) })
  })
  it('habitude qui ne commence que plus tard : 0', () => {
    const later = makeHabit('later', A, 'do', { activeFrom: d(14) })
    expect(streak([], d(7), later)).toEqual({ current: 0, record: 0, recordEnd: null })
  })
  it('aucune donnée', () => {
    expect(streak([], d(5))).toEqual({ current: 0, record: 0, recordEnd: null })
  })
})

describe('checkinStreak (check-in complet)', () => {
  const habits = defaultHabits()
  const s = (checkins: Checkin[], today: string) => checkinStreak(A, habits, indexCheckins(checkins), START, today)

  it('compte les jours complets, peu importe les réponses', () => {
    const c = fillPlayer(habits, A, d(0), d(4), (h) => (h.kind === 'avoid' ? 'craquage' : 'pasfait'))
    expect(s(c, d(4))).toEqual({ current: 5, record: 5, recordEnd: d(4) })
  })
  it('aujourd’hui à moitié rempli ne casse pas la série', () => {
    const c = [...fillPlayer(habits, A, d(0), d(3)), ci(A, 'a-ongles', d(4), 'nickel')]
    expect(s(c, d(4))).toEqual({ current: 4, record: 4, recordEnd: d(3) })
  })
  it('un jour passé à moitié rempli la casse', () => {
    const c = [...fillPlayer(habits, A, d(0), d(1)), ci(A, 'a-ongles', d(2), 'nickel'), ...fillPlayer(habits, A, d(3), d(4))]
    expect(s(c, d(4))).toEqual({ current: 2, record: 2, recordEnd: d(1) })
  })
  it('un jour oublié la casse', () => {
    const c = [...fillPlayer(habits, A, d(0), d(2)), ...fillPlayer(habits, A, d(4), d(4))]
    expect(s(c, d(5)).current).toBe(1)
  })
})

describe('scanStreak', () => {
  const judge = (map: Record<string, DayVerdict>) => (day: string) => map[day] ?? 'empty'
  it('premier jour où l’objectif est atteint et nombre de fois', () => {
    const verdicts: Record<string, DayVerdict> = {}
    for (let i = 0; i < 15; i++) verdicts[d(i)] = 'ok'
    const scan = scanStreak(d(0), d(14), judge(verdicts), 7)
    expect(scan).toMatchObject({ current: 15, record: 15, reachedOn: d(6), blocks: 2 })
  })
  it('les jours ignorés ne cassent pas la série', () => {
    const scan = scanStreak(d(0), d(4), judge({ [d(0)]: 'ok', [d(1)]: 'skip', [d(2)]: 'ok', [d(3)]: 'skip', [d(4)]: 'ok' }), 3)
    expect(scan).toMatchObject({ current: 3, reachedOn: d(4), blocks: 1 })
  })
  it('sans objectif : pas de déblocage', () => {
    expect(scanStreak(d(0), d(1), () => 'ok')).toMatchObject({ current: 2, reachedOn: null, blocks: 0 })
  })
})

describe('habitCalendar', () => {
  it('statuts : réponses, vide, inactif, futur', () => {
    const h = makeHabit('h', A, 'avoid', { activeFrom: d(1) })
    const cells = habitCalendar(h, indexCheckins([ci(A, 'h', d(1), 'nickel'), ci(A, 'h', d(3), 'craquage')]), d(0), d(5), d(3))
    expect(cells.map((c) => c.status)).toEqual(['inactive', 'nickel', 'empty', 'craquage', 'future', 'future'])
  })
})
