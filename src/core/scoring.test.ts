import { describe, expect, it } from 'vitest'
import { RULES } from '../config/rules'
import { addDays, weekDays } from './dates'
import {
  activeHabits,
  canEditCheckin,
  canWeighIn,
  dailyScore,
  indexCheckins,
  isHabitActiveOn,
  isWeighInDay,
  maxPointsFor,
  percentChange,
  playerWeekScore,
  pointsFor,
  valuesFor,
  weekOutcome,
  weighInDateOfWeek,
  weighInDayFor,
  weighInOfWeek,
  weighInPoints,
  type PlayerWeekScore,
} from './scoring'
import { A, L, START, ci, defaultHabits, fillPlayer, makeHabit, scoringDataOf, weighIns } from './test-helpers'
import type { Checkin } from './types'

const MON = START // lundi 26 octobre 2026
const SUN = addDays(MON, 6)

describe('points du check-in', () => {
  it('à éviter : nickel 10, un peu 5, craquage 0', () => {
    expect(pointsFor('avoid', 'nickel')).toBe(10)
    expect(pointsFor('avoid', 'unpeu')).toBe(5)
    expect(pointsFor('avoid', 'craquage')).toBe(0)
  })
  it('à faire : fait 10, pas fait 0', () => {
    expect(pointsFor('do', 'fait')).toBe(10)
    expect(pointsFor('do', 'pasfait')).toBe(0)
  })
  it('non rempli ou valeur du mauvais type = 0', () => {
    expect(pointsFor('avoid', null)).toBe(0)
    expect(pointsFor('do', undefined)).toBe(0)
    expect(pointsFor('do', 'nickel')).toBe(0)
    expect(pointsFor('avoid', 'fait')).toBe(0)
  })
  it('max par type et valeurs proposées', () => {
    expect(maxPointsFor('avoid')).toBe(10)
    expect(maxPointsFor('do')).toBe(10)
    expect(valuesFor('avoid')).toEqual(['nickel', 'unpeu', 'craquage'])
    expect(valuesFor('do')).toEqual(['fait', 'pasfait'])
  })
})

describe('habitudes actives', () => {
  it('activeFrom inclus, activeUntil exclu', () => {
    const h = makeHabit('h', A, 'avoid', { activeFrom: '2026-11-02', activeUntil: '2026-11-09' })
    expect(isHabitActiveOn(h, '2026-11-01')).toBe(false)
    expect(isHabitActiveOn(h, '2026-11-02')).toBe(true)
    expect(isHabitActiveOn(h, '2026-11-08')).toBe(true)
    expect(isHabitActiveOn(h, '2026-11-09')).toBe(false)
  })
  it('triées par ordre d’affichage, filtrées par joueur', () => {
    const list = activeHabits(
      [
        makeHabit('b', A, 'do', { sortOrder: 2 }),
        makeHabit('a', A, 'avoid', { sortOrder: 1 }),
        makeHabit('x', L, 'avoid', { sortOrder: 0 }),
      ],
      A,
      MON,
    )
    expect(list.map((h) => h.id)).toEqual(['a', 'b'])
  })
})

describe('score du jour (/100)', () => {
  const habits = defaultHabits()
  const score = (checkins: Checkin[], day = MON, player = A) => dailyScore(player, day, habits, indexCheckins(checkins))

  it('journée parfaite = 100', () => {
    const d = score([ci(A, 'a-ongles', MON, 'nickel'), ci(A, 'a-grignotage', MON, 'nickel'), ci(A, 'a-sport', MON, 'fait')])
    expect(d).toMatchObject({ score: 100, points: 30, possible: 30, filled: 3, total: 3, complete: true, perfect: true })
  })
  it('jour oublié = 0, pas complet', () => {
    expect(score([])).toMatchObject({ score: 0, points: 0, possible: 30, filled: 0, complete: false, perfect: false })
  })
  it('habitude non remplie = 0 pt mais compte dans le possible', () => {
    const d = score([ci(A, 'a-ongles', MON, 'nickel'), ci(A, 'a-sport', MON, 'fait')])
    expect(d).toMatchObject({ points: 20, possible: 30, score: 67, filled: 2, complete: false })
  })
  it('arrondi à l’entier le plus proche (3 habitudes)', () => {
    // 25 / 30 = 83,33 → 83
    expect(score([ci(A, 'a-ongles', MON, 'nickel'), ci(A, 'a-grignotage', MON, 'unpeu'), ci(A, 'a-sport', MON, 'fait')]).score).toBe(83)
    // 5 / 30 = 16,67 → 17
    expect(score([ci(A, 'a-ongles', MON, 'unpeu'), ci(A, 'a-grignotage', MON, 'craquage'), ci(A, 'a-sport', MON, 'pasfait')]).score).toBe(17)
  })
  it('équitable quel que soit le nombre d’habitudes (2 vs 4)', () => {
    const two = [makeHabit('x1', 'p2', 'avoid'), makeHabit('x2', 'p2', 'do')]
    const four = [0, 1, 2, 3].map((i) => makeHabit(`y${i}`, 'p4', i < 3 ? 'avoid' : 'do'))
    const d2 = dailyScore('p2', MON, two, indexCheckins([ci('p2', 'x1', MON, 'unpeu'), ci('p2', 'x2', MON, 'fait')]))
    expect(d2.score).toBe(75) // 15 / 20
    const c4 = [ci('p4', 'y0', MON, 'nickel'), ci('p4', 'y1', MON, 'nickel'), ci('p4', 'y2', MON, 'unpeu'), ci('p4', 'y3', MON, 'fait')]
    expect(dailyScore('p4', MON, four, indexCheckins(c4)).score).toBe(88) // 35 / 40 = 87,5 → 88
    // Tout parfait = 100 dans les deux cas.
    expect(dailyScore('p2', MON, two, indexCheckins([ci('p2', 'x1', MON, 'nickel'), ci('p2', 'x2', MON, 'fait')])).score).toBe(100)
  })
  it('à faire vs à éviter : « pas fait » = craquage = 0, « un peu » = moitié', () => {
    const h = [makeHabit('av', 'p', 'avoid'), makeHabit('do', 'p', 'do')]
    expect(dailyScore('p', MON, h, indexCheckins([ci('p', 'av', MON, 'unpeu'), ci('p', 'do', MON, 'pasfait')])).score).toBe(25)
    expect(dailyScore('p', MON, h, indexCheckins([ci('p', 'av', MON, 'craquage'), ci('p', 'do', MON, 'fait')])).score).toBe(50)
  })
  it('aucune habitude active = 0, jamais complet', () => {
    expect(dailyScore('nobody', MON, habits, indexCheckins([]))).toMatchObject({ score: 0, possible: 0, complete: false, perfect: false })
  })
  it('une habitude inactive ce jour-là ne compte pas', () => {
    const h = [makeHabit('old', 'p', 'avoid', { activeUntil: MON }), makeHabit('new', 'p', 'do', { activeFrom: MON })]
    const d = dailyScore('p', MON, h, indexCheckins([ci('p', 'new', MON, 'fait')]))
    expect(d).toMatchObject({ score: 100, total: 1, complete: true, perfect: true })
  })
  it('le check-in de l’autre joueur ne compte pas pour moi', () => {
    expect(score([ci(L, 'a-ongles', MON, 'nickel')]).points).toBe(0)
  })
})

describe('pesée : points', () => {
  const pts = (changePct: number | null, goalDistancePct: number | null = null) => weighInPoints({ changePct, goalDistancePct })
  it('toute première pesée = 0 (point de départ), même dans la zone objectif', () => {
    expect(pts(null)).toBe(0)
    expect(pts(null, 0)).toBe(0)
  })
  it('pas de pesée = 0', () => {
    expect(weighInPoints(null)).toBe(0)
    expect(weighInPoints(undefined)).toBe(0)
  })
  it('−0,5 % = 50, −1 % = 100, −3 % plafonné à 100', () => {
    expect(pts(-0.5)).toBe(50)
    expect(pts(-1)).toBe(100)
    expect(pts(-3)).toBe(100)
    expect(pts(-0.25)).toBe(25)
  })
  it('stable ou en hausse = 0', () => {
    expect(pts(0)).toBe(0)
    expect(pts(0.4)).toBe(0)
    expect(pts(5)).toBe(0)
  })
  it('vraies pesées en kg : 80 → 79,6 = −0,5 % = 50 pts ; 80 → 79,2 = −1 % = 100 pts', () => {
    expect(weighInPoints({ changePct: percentChange(80, 79.6), goalDistancePct: null })).toBe(50)
    expect(weighInPoints({ changePct: percentChange(80, 79.2), goalDistancePct: null })).toBe(100)
    expect(percentChange(80, 79.2)).toBeCloseTo(-1, 10)
  })
  it('arrondi à l’entier', () => {
    expect(pts(-0.333)).toBe(33)
    expect(pts(-0.666)).toBe(67)
  })
  it('zone objectif ±1 % = 100, et on garde le meilleur des deux calculs', () => {
    expect(pts(0.4, 0.5)).toBe(100) // en hausse mais dans la zone
    expect(pts(0, -1)).toBe(100) // pile à la limite basse
    expect(pts(0, 1)).toBe(100) // pile à la limite haute
    expect(pts(-0.3, 1.01)).toBe(30) // hors zone : variation seulement
    expect(pts(-0.3, -1.5)).toBe(30)
    expect(pts(-2, 0)).toBe(100)
  })
  it('zone objectif avec de vrais kilos (objectif 70 kg)', () => {
    const w = weighIns([
      { playerId: A, day: '2026-10-25', weightKg: 70.5 },
      { playerId: A, day: '2026-11-01', weightKg: 70.6 },
    ], { [A]: 70 })
    const second = w.find((x) => x.day === '2026-11-01')!
    expect(second.changePct).toBeGreaterThan(0)
    expect(second.goalDistancePct).toBeCloseTo(0.857, 2)
    expect(weighInPoints(second)).toBe(100)
  })
})

describe('pesée : jour J', () => {
  const settings = { weighInDays: [{ from: START, isoDay: 7 }] }
  it('dimanche par défaut', () => {
    expect(weighInDayFor(MON, settings)).toBe(7)
    expect(weighInDateOfWeek(MON, settings)).toBe(SUN)
    expect(isWeighInDay(SUN, settings)).toBe(true)
    expect(isWeighInDay(addDays(SUN, -1), settings)).toBe(false)
  })
  it('sans règle : le jour par défaut de la config', () => {
    expect(weighInDayFor(MON, { weighInDays: [] })).toBe(RULES.weighIn.defaultDay)
  })
  it('un changement s’applique à partir du lundi suivant (historique)', () => {
    const changed = { weighInDays: [{ from: START, isoDay: 7 }, { from: '2026-11-09', isoDay: 3 }] }
    // Manche du 2 novembre : toujours le dimanche.
    expect(weighInDayFor('2026-11-04', changed)).toBe(7)
    expect(weighInDateOfWeek('2026-11-02', changed)).toBe('2026-11-08')
    // Manche du 9 novembre : le mercredi.
    expect(weighInDayFor('2026-11-09', changed)).toBe(3)
    expect(weighInDayFor('2026-11-15', changed)).toBe(3)
    expect(weighInDateOfWeek('2026-11-09', changed)).toBe('2026-11-11')
    // L'ordre de la liste n'a pas d'importance.
    expect(weighInDayFor('2026-11-20', { weighInDays: [...changed.weighInDays].reverse() })).toBe(3)
  })
  it('un changement daté d’un mercredi s’applique au lundi suivant (pas en cours de manche)', () => {
    const odd = { weighInDays: [{ from: START, isoDay: 7 }, { from: '2026-11-04', isoDay: 1 }] }
    expect(weighInDayFor('2026-11-08', odd)).toBe(7)
    expect(weighInDayFor('2026-11-09', odd)).toBe(1)
  })
  it('canWeighIn : uniquement le jour J', () => {
    expect(canWeighIn(SUN, settings)).toBe(true)
    for (const d of weekDays(MON).slice(0, 6)) expect(canWeighIn(d, settings)).toBe(false)
  })
})

describe('fenêtre de saisie du check-in', () => {
  const settings = { seasonStart: START }
  const WED = addDays(MON, 2)
  it('aujourd’hui et hier en milieu de semaine', () => {
    expect(canEditCheckin(WED, WED, settings)).toBe(true)
    expect(canEditCheckin(addDays(WED, -1), WED, settings)).toBe(true)
  })
  it('pas avant-hier, pas le futur', () => {
    expect(canEditCheckin(addDays(WED, -2), WED, settings)).toBe(false)
    expect(canEditCheckin(addDays(WED, 1), WED, settings)).toBe(false)
  })
  it('le lundi, le dimanche (manche close) n’est plus modifiable', () => {
    const nextMon = addDays(MON, 7)
    expect(canEditCheckin(SUN, nextMon, settings)).toBe(false)
    expect(canEditCheckin(nextMon, nextMon, settings)).toBe(true)
  })
  it('le dimanche, samedi et dimanche sont modifiables', () => {
    expect(canEditCheckin(addDays(SUN, -1), SUN, settings)).toBe(true)
    expect(canEditCheckin(SUN, SUN, settings)).toBe(true)
  })
  it('rien avant le début du duel', () => {
    expect(canEditCheckin(addDays(START, -1), START, settings)).toBe(false)
    expect(canEditCheckin(addDays(START, -1), addDays(START, -1), settings)).toBe(false)
  })
})

describe('score de la manche', () => {
  const habits = defaultHabits()
  const w = weighIns([
    { playerId: A, day: addDays(MON, -1), weightKg: 80 },
    { playerId: A, day: SUN, weightKg: 79.6 },
  ])

  it('7 jours parfaits + pesée = somme (max 800)', () => {
    const data = scoringDataOf(habits, fillPlayer(habits, A, MON, SUN), w)
    const s = playerWeekScore(A, MON, data)
    expect(s.days).toHaveLength(7)
    expect(s.daysTotal).toBe(700)
    expect(s.weighInPoints).toBe(50)
    expect(s.total).toBe(750)
  })
  it('la pesée de départ (semaine d’avant) ne compte pas dans la manche', () => {
    expect(weighInOfWeek(w, A, MON)?.day).toBe(SUN)
    expect(weighInOfWeek(w, A, addDays(MON, -7))?.day).toBe(addDays(MON, -1))
    expect(weighInOfWeek(w, L, MON)).toBeNull()
  })
  it('upTo : les jours après ne comptent pas, ni la pesée du dimanche', () => {
    const data = scoringDataOf(habits, fillPlayer(habits, A, MON, SUN), w)
    const thursday = addDays(MON, 3)
    const s = playerWeekScore(A, MON, data, RULES, thursday)
    expect(s.daysTotal).toBe(400)
    expect(s.weighIn).toBeNull()
    expect(s.weighInPoints).toBe(0)
    expect(s.total).toBe(400)
    expect(s.days[4]).toMatchObject({ score: 0, total: 0, complete: false })
    // upTo = dimanche : tout compte.
    expect(playerWeekScore(A, MON, data, RULES, SUN).total).toBe(750)
  })
  it('jours oubliés = 0', () => {
    const data = scoringDataOf(habits, fillPlayer(habits, A, MON, addDays(MON, 2)))
    expect(playerWeekScore(A, MON, data).total).toBe(300)
  })
})

describe('issue de la manche', () => {
  const s = (playerId: string, total: number): PlayerWeekScore => ({
    playerId,
    days: [],
    daysTotal: total,
    weighIn: null,
    weighInPoints: 0,
    total,
  })
  it('le plus haut score gagne, le perdant fait le gage', () => {
    expect(weekOutcome(s(A, 512), s(L, 480))).toEqual({ winnerId: A, gageFor: [L], tie: false, gap: 32 })
    expect(weekOutcome(s(A, 300), s(L, 480))).toEqual({ winnerId: L, gageFor: [A], tie: false, gap: 180 })
  })
  it('égalité (même total entier) : gage pour les deux', () => {
    expect(weekOutcome(s(A, 500), s(L, 500))).toEqual({ winnerId: null, gageFor: [A, L], tie: true, gap: 0 })
  })
  it('écart d’un point = victoire', () => {
    expect(weekOutcome(s(A, 501), s(L, 500))).toMatchObject({ winnerId: A, gap: 1 })
  })
})
