import { describe, expect, it } from 'vitest'
import { RULES } from '../config/rules'
import { BADGES, badgeUnlocksToRecord, badgesUnlockedOn, computeBadges, type BadgeId, type BadgeState } from './badges'
import { addDays, weekEndOf } from './dates'
import { buildSeason } from './season'
import {
  A,
  L,
  START,
  ci,
  defaultHabits,
  fill,
  fillPlayer,
  makeHabit,
  makeSnapshot,
  weekOf,
  weighIns,
  type SnapshotInput,
} from './test-helpers'
import type { BadgeUnlock, Checkin, DuelSnapshot, Habit, WeighIn } from './types'

const d = (n: number) => addDays(START, n)
const habits = defaultHabits()
const H = (id: string) => habits.find((h) => h.id === id)!

/** Invariants de tous les badges : chaque obtention datée, dans l'ordre, cohérente avec count. */
function expectConsistent(list: BadgeState[]) {
  for (const b of list) {
    expect([...b.unlockDays].sort(), b.id).toEqual(b.unlockDays)
    expect(b.unlockDays.length, b.id).toBe(b.count)
    expect(b.unlockedOn, b.id).toBe(b.unlockDays[0] ?? null)
    expect(b.unlocked, b.id).toBe(b.unlockDays.length > 0)
    expect(b.progress.current, b.id).toBeLessThanOrEqual(b.progress.target)
    expect(b.progress.current, b.id).toBeGreaterThanOrEqual(0)
  }
}

function badgesFor(player: string, input: SnapshotInput, today: string): Record<BadgeId, BadgeState> {
  const snapshot = makeSnapshot(input)
  const season = buildSeason(snapshot, today)
  const list = computeBadges(player, snapshot, season, today)
  expectConsistent(list)
  return Object.fromEntries(list.map((b) => [b.id, b])) as Record<BadgeId, BadgeState>
}

const unlock = (playerId: string, badgeId: BadgeId, day: string, tier: number | null = null): BadgeUnlock => ({ playerId, badgeId, tier, day })

describe('liste des badges', () => {
  it('9 badges, dans l’ordre de la galerie, avec les seuils de la config', () => {
    expect(BADGES.map((b) => b.id)).toEqual(['manucure', 'zen', 'frigo', 'machine', 'assidu', 'plume', 'remontada', 'royale', 'inarretable'])
    expect(BADGES.map((b) => b.emoji).join('')).toBe('💅🧘🔒🏋️📅🪶🚀👑🔥')
    const byId = Object.fromEntries(BADGES.map((b) => [b.id, b]))
    expect(byId.manucure.description).toContain(`${RULES.badges.cleanStreakDays} jours`)
    expect(byId.machine.description).toContain(`${RULES.badges.sportDaysPerWeek} jours`)
    expect(byId.inarretable.description).toContain(`${RULES.badges.unstoppableDays} jours`)
    expect(byId.royale.description).toContain(`${RULES.badges.royalStreakWeeks} manches`)
    expect(byId.plume.description).toBe('−2 % depuis le départ, puis −5 % et −10 %')
  })
  it('computeBadges renvoie les 9 badges avec leur définition', () => {
    const list = computeBadges(A, makeSnapshot(), buildSeason(makeSnapshot(), START), START)
    expect(list.map((b) => b.id)).toEqual(BADGES.map((b) => b.id))
    expect(list.every((b) => b.name && b.emoji && b.description)).toBe(true)
    expect(list.every((b) => !b.unlocked && b.unlockedOn === null && b.count === 0)).toBe(true)
  })
})

describe('💅 🧘 🔒 séries « nickel »', () => {
  const nails = H('a-ongles')

  it('💅 7 jours nickel d’affilée → débloqué le 7e jour', () => {
    const b = badgesFor(A, { checkins: fill(nails, d(0), d(6)) }, d(6)).manucure
    expect(b).toMatchObject({ applicable: true, unlocked: true, unlockedOn: d(6), progress: { current: 7, target: 7 }, count: 1 })
  })
  it('6 jours + aujourd’hui pas encore rempli → 6/7, pas encore', () => {
    const b = badgesFor(A, { checkins: fill(nails, d(0), d(5)) }, d(6)).manucure
    expect(b).toMatchObject({ unlocked: false, unlockedOn: null, progress: { current: 6, target: 7 }, count: 0 })
  })
  it('un jour passé non rempli casse la série', () => {
    const checkins = [...fill(nails, d(0), d(2)), ...fill(nails, d(4), d(9))]
    const b = badgesFor(A, { checkins }, d(10)).manucure
    expect(b).toMatchObject({ unlocked: false, progress: { current: 6, target: 7 } })
  })
  it('« un peu » casse la série', () => {
    const checkins = [...fill(nails, d(0), d(3)), ci(A, nails.id, d(4), 'unpeu'), ...fill(nails, d(5), d(8))]
    expect(badgesFor(A, { checkins }, d(8)).manucure).toMatchObject({ unlocked: false, progress: { current: 4, target: 7 } })
  })
  it('les jours après aujourd’hui ne comptent pas', () => {
    expect(badgesFor(A, { checkins: fill(nails, d(0), d(9)) }, d(4)).manucure).toMatchObject({ unlocked: false, progress: { current: 5 } })
  })
  it('un badge débloqué le reste, même après un craquage', () => {
    const checkins = [...fill(nails, d(0), d(6)), ci(A, nails.id, d(7), 'craquage'), ...fill(nails, d(8), d(9))]
    const b = badgesFor(A, { checkins }, d(9)).manucure
    expect(b).toMatchObject({ unlocked: true, unlockedOn: d(6), progress: { current: 7, target: 7 }, count: 1 })
  })
  it('14 jours = obtenu 2 fois', () => {
    expect(badgesFor(A, { checkins: fill(nails, d(0), d(13)) }, d(13)).manucure.count).toBe(2)
  })
  it('les jours où l’habitude est inactive sont ignorés', () => {
    const late = makeHabit('a-ongles', A, 'avoid', { badgeKey: 'ongles', activeFrom: d(7) })
    const others = habits.filter((h) => h.id !== 'a-ongles')
    const b = badgesFor(A, { habits: [...others, late], checkins: fill(late, d(7), d(13)) }, d(13)).manucure
    expect(b).toMatchObject({ unlocked: true, unlockedOn: d(13) })
  })
  it('non concerné sans l’habitude (Laetitia ne se ronge pas les ongles)', () => {
    expect(badgesFor(L, {}, d(3)).manucure).toMatchObject({ applicable: false, unlocked: false })
    expect(badgesFor(A, {}, d(3)).zen).toMatchObject({ applicable: false })
  })
  it('🧘 Zen absolu pour Laetitia (grattage)', () => {
    const b = badgesFor(L, { checkins: fill(H('l-grattage'), d(2), d(8)) }, d(9)).zen
    expect(b).toMatchObject({ applicable: true, unlocked: true, unlockedOn: d(8) })
  })
  it('🔒 Frigo fermé : chacun sa propre habitude grignotage', () => {
    const checkins = fill(H('l-grignotage'), d(0), d(6))
    expect(badgesFor(L, { checkins }, d(6)).frigo).toMatchObject({ unlocked: true, unlockedOn: d(6) })
    expect(badgesFor(A, { checkins }, d(6)).frigo).toMatchObject({ applicable: true, unlocked: false, progress: { current: 0 } })
  })
})

describe('🏋️ Machine', () => {
  const sport = H('a-sport')
  const W1 = weekOf(1)
  const W2 = weekOf(2)

  it('5 jours de sport dans la même manche → débloqué le 5e jour', () => {
    const checkins = [...fill(sport, W1, addDays(W1, 1)), ...fill(sport, addDays(W1, 3), addDays(W1, 5))]
    const b = badgesFor(A, { checkins }, addDays(W1, 6)).machine
    expect(b).toMatchObject({ unlocked: true, unlockedOn: addDays(W1, 5), count: 1, progress: { current: 5, target: 5 } })
  })
  it('5 jours mais à cheval sur deux manches → non', () => {
    const checkins = fill(sport, addDays(W1, 3), addDays(W2, 0))
    const b = badgesFor(A, { checkins }, addDays(W2, 1)).machine
    expect(b).toMatchObject({ unlocked: false, progress: { current: 1, target: 5 } })
  })
  it('« pas fait » ne compte pas', () => {
    const checkins = [...fill(sport, W1, addDays(W1, 3)), ...fill(sport, addDays(W1, 4), addDays(W1, 6), 'pasfait')]
    expect(badgesFor(A, { checkins }, addDays(W1, 6)).machine.unlocked).toBe(false)
  })
  it('progression de la manche en cours', () => {
    // Jeudi, sport fait lundi → jeudi : 4 / 5, et encore 3 séances jouables (vendredi → dimanche).
    expect(badgesFor(A, { checkins: fill(sport, W2, addDays(W2, 3)) }, addDays(W2, 3)).machine.progress).toEqual({ current: 4, target: 5, possible: 3 })
  })
  it('plusieurs manches = plusieurs fois', () => {
    const checkins = [...fill(sport, W1, addDays(W1, 4)), ...fill(sport, W2, addDays(W2, 6))]
    expect(badgesFor(A, { checkins }, addDays(W2, 6)).machine).toMatchObject({ unlockedOn: addDays(W1, 4), count: 2 })
  })
  it('non concerné sans habitude sport', () => {
    expect(badgesFor(A, { habits: habits.filter((h) => h.badgeKey !== 'sport') }, d(3)).machine.applicable).toBe(false)
  })
})

describe('📅 Assidu·e', () => {
  it('7 jours d’affilée avec un check-in complet (peu importe les réponses)', () => {
    const checkins = fillPlayer(habits, A, d(0), d(6), (h) => (h.kind === 'avoid' ? 'craquage' : 'pasfait'))
    expect(badgesFor(A, { checkins }, d(6)).assidu).toMatchObject({ unlocked: true, unlockedOn: d(6), count: 1 })
  })
  it('un jour passé incomplet casse la série', () => {
    const checkins = [...fillPlayer(habits, A, d(0), d(2)), ci(A, 'a-ongles', d(3), 'nickel'), ...fillPlayer(habits, A, d(4), d(8))]
    expect(badgesFor(A, { checkins }, d(9)).assidu).toMatchObject({ unlocked: false, progress: { current: 5, target: 7 } })
  })
  it('aujourd’hui à moitié rempli ne casse pas la progression', () => {
    const checkins = [...fillPlayer(habits, A, d(0), d(5)), ci(A, 'a-ongles', d(6), 'nickel')]
    expect(badgesFor(A, { checkins }, d(6)).assidu).toMatchObject({ unlocked: false, progress: { current: 6, target: 7 } })
  })
  it('rien avant le début du duel', () => {
    expect(badgesFor(A, {}, addDays(START, -2)).assidu).toMatchObject({ unlocked: false, progress: { current: 0 } })
  })
})

describe('🪶 Plume', () => {
  const ref = addDays(START, -1) // pesée de départ, le dimanche d'avant
  const sundays = [0, 1, 2, 3].map((i) => addDays(START, 6 + i * 7))
  const raw = (kgs: number[]) => [
    { playerId: A, day: ref, weightKg: 80 },
    ...kgs.map((kg, i) => ({ playerId: A, day: sundays[i], weightKg: kg })),
  ]

  it('palier −2 % (80 → 78,4 kg, malgré les arrondis des flottants)', () => {
    const b = badgesFor(A, { weighIns: weighIns(raw([79, 78.4])) }, sundays[1]).plume
    expect(b.unlocked).toBe(true)
    expect(b.unlockedOn).toBe(sundays[1])
    expect(b.count).toBe(1)
    expect(b.tiers).toEqual([
      { label: '−2 %', pct: 2, unlockedOn: sundays[1] },
      { label: '−5 %', pct: 5, unlockedOn: null },
      { label: '−10 %', pct: 10, unlockedOn: null },
    ])
    // Progression vers −5 %, en dixièmes de % : −2,0 % → 20 / 50.
    expect(b.progress).toEqual({ current: 20, target: 50 })
  })
  it('pas encore −2 % : progression 12 / 20 (−1,25 %, arrondi vers le bas)', () => {
    const b = badgesFor(A, { weighIns: weighIns(raw([79])) }, sundays[0]).plume
    expect(b).toMatchObject({ unlocked: false, unlockedOn: null, count: 0, progress: { current: 12, target: 20 } })
  })
  it('tous les paliers : −5 % puis −10 %', () => {
    const b = badgesFor(A, { weighIns: weighIns(raw([78, 76, 74, 72])) }, sundays[3]).plume
    expect(b.tiers?.map((t) => t.unlockedOn)).toEqual([sundays[0], sundays[1], sundays[3]])
    expect(b).toMatchObject({ unlocked: true, unlockedOn: sundays[0], count: 3, progress: { current: 100, target: 100 } })
  })
  it('un palier débloqué le reste, même si ça remonte', () => {
    const b = badgesFor(A, { weighIns: weighIns(raw([78, 79.2])) }, sundays[1]).plume
    expect(b).toMatchObject({ unlocked: true, unlockedOn: sundays[0], progress: { current: 10, target: 50 } })
  })
  it('sans pesée : verrouillé, 0 / 20', () => {
    expect(badgesFor(A, {}, d(10)).plume).toMatchObject({ applicable: true, unlocked: false, count: 0, progress: { current: 0, target: 20 } })
  })
  it('en hausse depuis le départ : progression 0', () => {
    expect(badgesFor(A, { weighIns: weighIns(raw([81])) }, sundays[0]).plume.progress).toEqual({ current: 0, target: 20 })
  })
  it('les pesées après aujourd’hui ne comptent pas', () => {
    expect(badgesFor(A, { weighIns: weighIns(raw([79, 78])) }, sundays[0]).plume.unlocked).toBe(false)
  })
  it('chacun ses pesées (les kilos de l’autre peuvent être masqués)', () => {
    const w = weighIns([...raw([78]), { playerId: L, day: ref, weightKg: 60 }, { playerId: L, day: sundays[0], weightKg: 59.9 }]).map((x) =>
      x.playerId === L ? { ...x, weightKg: null } : x,
    )
    expect(badgesFor(L, { weighIns: w }, sundays[0]).plume.unlocked).toBe(false)
    expect(badgesFor(A, { weighIns: w }, sundays[0]).plume.unlocked).toBe(true)
  })
})

describe('🚀 Remontada', () => {
  const W1 = weekOf(1)
  const thu = addDays(W1, 3)
  const nextMonday = addDays(W1, 7)
  const nothingFor = (player: string, from: string, to: string): Checkin[] =>
    fillPlayer(habits, player, from, to, (h) => (h.kind === 'avoid' ? 'craquage' : 'pasfait'))

  it('mené le jeudi soir puis vainqueur → débloqué le dimanche', () => {
    const checkins = [
      ...fillPlayer(habits, L, W1, thu), // Laetitia : 400 au jeudi soir
      ...fillPlayer(habits, A, W1, addDays(W1, 2)), // Arthus : 300 au jeudi soir
      ...nothingFor(A, thu, thu),
      ...fillPlayer(habits, A, addDays(W1, 4), weekEndOf(W1)), // puis 300 de plus
      ...nothingFor(L, addDays(W1, 4), weekEndOf(W1)),
    ]
    const a = badgesFor(A, { checkins }, nextMonday)
    expect(a.remontada).toMatchObject({ unlocked: true, unlockedOn: weekEndOf(W1), count: 1, progress: { current: 1, target: 1 } })
    expect(badgesFor(L, { checkins }, nextMonday).remontada.unlocked).toBe(false)
  })
  it('vainqueur mais devant le jeudi → non', () => {
    const checkins = [...fillPlayer(habits, A, W1, weekEndOf(W1)), ...fillPlayer(habits, L, W1, addDays(W1, 1))]
    expect(badgesFor(A, { checkins }, nextMonday).remontada.unlocked).toBe(false)
  })
  it('à égalité le jeudi (pas strictement mené) → non', () => {
    const checkins = [...fillPlayer(habits, A, W1, weekEndOf(W1)), ...fillPlayer(habits, L, W1, thu)]
    const season = buildSeason(makeSnapshot({ checkins }), nextMonday)
    expect(season.finished[0].outcome.winnerId).toBe(A)
    expect(badgesFor(A, { checkins }, nextMonday).remontada.unlocked).toBe(false)
  })
  it('mené le jeudi et perdant → non', () => {
    const checkins = [...fillPlayer(habits, L, W1, weekEndOf(W1)), ...fillPlayer(habits, A, addDays(W1, 4), weekEndOf(W1))]
    expect(badgesFor(A, { checkins }, nextMonday).remontada.unlocked).toBe(false)
  })
  it('manche pas encore terminée (dimanche) → pas encore', () => {
    const checkins = [...fillPlayer(habits, L, W1, thu), ...fillPlayer(habits, A, addDays(W1, 1), weekEndOf(W1))]
    expect(badgesFor(A, { checkins }, weekEndOf(W1)).remontada.unlocked).toBe(false)
    expect(badgesFor(A, { checkins }, nextMonday).remontada.unlocked).toBe(true)
  })
  it('la pesée du mercredi compte dans le score du jeudi soir', () => {
    const weighInDays = [{ from: START, isoDay: 3 }]
    const w = weighIns([
      { playerId: L, day: addDays(W1, -5), weightKg: 60 }, // pesée de départ le mercredi d'avant
      { playerId: L, day: addDays(W1, 2), weightKg: 59.4 }, // −1 % = 100 pts
    ])
    const checkins = [
      ...fillPlayer(habits, A, W1, weekEndOf(W1)), // 700
      ...fillPlayer(habits, L, W1, thu), // 400 + 100 de pesée = 500 au jeudi soir (Arthus : 400)
    ]
    const b = badgesFor(A, { checkins, weighIns: w, weighInDays }, nextMonday)
    expect(b.remontada.unlocked).toBe(true)
  })
})

describe('👑 Série royale', () => {
  const win = (player: string, n: number): Checkin[] => fillPlayer(habits, player, weekOf(n), weekEndOf(weekOf(n)))
  const tie = (n: number): Checkin[] => [...win(A, n), ...win(L, n)]

  it('3 manches gagnées d’affilée → débloqué le dimanche de la 3e', () => {
    const b = badgesFor(A, { checkins: [...win(A, 1), ...win(A, 2), ...win(A, 3)] }, weekOf(4)).royale
    expect(b).toMatchObject({ unlocked: true, unlockedOn: weekEndOf(weekOf(3)), count: 1, progress: { current: 3, target: 3 } })
  })
  it('une égalité casse la série', () => {
    const b = badgesFor(A, { checkins: [...win(A, 1), ...win(A, 2), ...tie(3), ...win(A, 4)] }, weekOf(5)).royale
    expect(b).toMatchObject({ unlocked: false, progress: { current: 1, target: 3 } })
  })
  it('une défaite casse la série', () => {
    const b = badgesFor(A, { checkins: [...win(A, 1), ...win(L, 2), ...win(A, 3), ...win(A, 4)] }, weekOf(5)).royale
    expect(b).toMatchObject({ unlocked: false, progress: { current: 2, target: 3 } })
  })
  it('la manche en cours ne compte pas', () => {
    const b = badgesFor(A, { checkins: [...win(A, 1), ...win(A, 2), ...win(A, 3)] }, weekEndOf(weekOf(3))).royale
    expect(b).toMatchObject({ unlocked: false, progress: { current: 2, target: 3 } })
  })
  it('6 manches d’affilée = 2 fois', () => {
    const checkins = [1, 2, 3, 4, 5, 6].flatMap((n) => win(A, n))
    expect(badgesFor(A, { checkins }, weekOf(7)).royale).toMatchObject({ unlocked: true, count: 2 })
    expect(badgesFor(L, { checkins }, weekOf(7)).royale).toMatchObject({ unlocked: false, progress: { current: 0 } })
  })
})

describe('🔥 Inarrêtable', () => {
  const N = RULES.badges.unstoppableDays
  it(`${N} jours nickel d’affilée sur une habitude à éviter`, () => {
    const b = badgesFor(L, { checkins: fill(H('l-grignotage'), d(0), d(N - 1)) }, d(N)).inarretable
    expect(b).toMatchObject({ unlocked: true, unlockedOn: d(N - 1), count: 1 })
  })
  it(`${N - 1} jours : presque`, () => {
    const b = badgesFor(L, { checkins: fill(H('l-grignotage'), d(0), d(N - 2)) }, d(N - 1)).inarretable
    expect(b).toMatchObject({ unlocked: false, progress: { current: N - 1, target: N } })
  })
  it('pas de cumul entre deux habitudes : la meilleure série', () => {
    const checkins = [...fill(H('l-grignotage'), d(0), d(19)), ...fill(H('l-grattage'), d(5), d(19))]
    expect(badgesFor(L, { checkins }, d(19)).inarretable.progress).toEqual({ current: 20, target: N })
  })
  it('marche aussi avec une habitude perso (ex. 🍷 Alcool)', () => {
    const wine: Habit = makeHabit('l-alcool', L, 'avoid', { name: 'Alcool', emoji: '🍷' })
    const b = badgesFor(L, { habits: [...habits, wine], checkins: fill(wine, d(0), d(N - 1)) }, d(N - 1)).inarretable
    expect(b.unlocked).toBe(true)
  })
  it('une habitude « à faire » ne compte pas', () => {
    const b = badgesFor(L, { checkins: fill(H('l-sport'), d(0), d(N + 2)) }, d(N + 2)).inarretable
    expect(b).toMatchObject({ unlocked: false, progress: { current: 0 } })
  })
  it('non concerné sans habitude à éviter', () => {
    expect(badgesFor(A, { habits: habits.filter((h) => h.kind === 'do') }, d(5)).inarretable.applicable).toBe(false)
  })
})

describe('badgesUnlockedOn', () => {
  it('les badges débloqués ce jour-là (pour l’animation)', () => {
    const snapshot = makeSnapshot({ checkins: fill(H('a-ongles'), d(0), d(6)) })
    const list = computeBadges(A, snapshot, buildSeason(snapshot, d(6)), d(6))
    expect(badgesUnlockedOn(list, d(6)).map((b) => b.id)).toEqual(['manucure'])
    expect(badgesUnlockedOn(list, d(5))).toEqual([])
  })
})

describe('🏋️ Machine : séances encore jouables (progress.possible)', () => {
  const sport = H('a-sport')
  const W2 = weekOf(2)
  const fri = addDays(W2, 4)

  it('vendredi, sport lundi et vendredi, jeudi oublié : jeudi (rattrapable), samedi, dimanche', () => {
    const checkins = [ci(A, sport.id, W2, 'fait'), ci(A, sport.id, fri, 'fait')]
    expect(badgesFor(A, { checkins }, fri).machine.progress).toEqual({ current: 2, target: 5, possible: 3 })
  })
  it('un « Pas fait » d’hier ne redevient pas une séance : plus assez de jours', () => {
    const checkins = [ci(A, sport.id, W2, 'fait'), ci(A, sport.id, addDays(W2, 3), 'pasfait'), ci(A, sport.id, fri, 'fait')]
    const p = badgesFor(A, { checkins }, fri).machine.progress
    expect(p).toEqual({ current: 2, target: 5, possible: 2 })
    expect(p.target - p.current).toBeGreaterThan(p.possible!)
  })
  it('aujourd’hui pas encore « Fait » (même « Pas fait ») : il est encore jouable', () => {
    const checkins = [ci(A, sport.id, addDays(W2, 3), 'pasfait'), ci(A, sport.id, fri, 'pasfait')]
    expect(badgesFor(A, { checkins }, fri).machine.progress.possible).toBe(3) // vendredi, samedi, dimanche
  })
  it('le lundi, le dimanche d’avant (manche close) ne compte pas', () => {
    expect(badgesFor(A, {}, W2).machine.progress.possible).toBe(7)
    expect(badgesFor(A, { checkins: [ci(A, sport.id, W2, 'fait')] }, W2).machine.progress).toEqual({ current: 1, target: 5, possible: 6 })
  })
  it('les jours où l’habitude sport ne compte plus sont exclus', () => {
    const closed = makeHabit('a-sport', A, 'do', { badgeKey: 'sport', activeUntil: addDays(W2, 5) })
    const others = habits.filter((h) => h.id !== 'a-sport')
    expect(badgesFor(A, { habits: [...others, closed] }, fri).machine.progress.possible).toBe(2) // jeudi, vendredi
  })
})

describe('🪶 Plume : progression arrondie vers le bas', () => {
  const ref = addDays(START, -1)
  const sun = addDays(START, 6)
  const plumeAt = (kg: number) =>
    badgesFor(A, { weighIns: weighIns([{ playerId: A, day: ref, weightKg: 80 }, { playerId: A, day: sun, weightKg: kg }]) }, sun).plume

  it('−4,99 % : 49 / 50, jamais 50 / 50 tant que −5 % n’est pas atteint', () => {
    const b = plumeAt(76.01)
    expect(b.tiers?.[1].unlockedOn).toBeNull()
    expect(b.progress).toEqual({ current: 49, target: 50 })
  })
  it('−5 % pile : palier atteint, on vise −10 %', () => {
    const b = plumeAt(76)
    expect(b.tiers?.[1].unlockedOn).toBe(sun)
    expect(b.progress).toEqual({ current: 50, target: 100 })
  })
  it('plafonnée sous le palier même avec un flottant limite', () => {
    const w: WeighIn[] = [
      { playerId: A, day: ref, weightKg: null, changePct: null, fromStartPct: 0, goalDistancePct: null },
      { playerId: A, day: sun, weightKg: null, changePct: -4.9999999, fromStartPct: -4.9999999, goalDistancePct: null },
    ]
    const b = badgesFor(A, { weighIns: w }, sun).plume
    expect(b.tiers?.[1].unlockedOn).toBeNull()
    expect(b.progress).toEqual({ current: 49, target: 50 })
  })
  it('deux paliers le même jour = deux obtentions ce jour-là', () => {
    const b = plumeAt(75.9) // −5,125 %
    expect(b.unlockDays).toEqual([sun, sun])
    expect(b).toMatchObject({ count: 2, progress: { current: 51, target: 100 } })
  })
})

describe('unlockDays : chaque obtention', () => {
  it('séries : le dernier jour de chaque bloc complet', () => {
    expect(badgesFor(A, { checkins: fill(H('a-ongles'), d(0), d(13)) }, d(13)).manucure.unlockDays).toEqual([d(6), d(13)])
    expect(badgesFor(A, { checkins: fillPlayer(habits, A, d(0), d(13)) }, d(13)).assidu.unlockDays).toEqual([d(6), d(13)])
  })
  it('🏋️ : le 5e « Fait » de chaque manche (le badge se regagne)', () => {
    const sport = H('a-sport')
    const [W1, W2] = [weekOf(1), weekOf(2)]
    const checkins = [...fill(sport, W1, addDays(W1, 4)), ...fill(sport, W2, addDays(W2, 6))]
    expect(badgesFor(A, { checkins }, addDays(W2, 6)).machine.unlockDays).toEqual([addDays(W1, 4), addDays(W2, 4)])
  })
  it('👑 : le dimanche de chaque triplé', () => {
    const checkins = [1, 2, 3, 4, 5, 6].flatMap((n) => fillPlayer(habits, A, weekOf(n), weekEndOf(weekOf(n))))
    expect(badgesFor(A, { checkins }, weekOf(7)).royale.unlockDays).toEqual([weekEndOf(weekOf(3)), weekEndOf(weekOf(6))])
  })
  it('🔥 : une obtention par habitude qui atteint la série', () => {
    const N = RULES.badges.unstoppableDays
    const checkins = [...fill(H('l-grignotage'), d(0), d(N - 1)), ...fill(H('l-grattage'), d(0), d(N - 1))]
    expect(badgesFor(L, { checkins }, d(N - 1)).inarretable).toMatchObject({ unlockDays: [d(N - 1), d(N - 1)], count: 2 })
  })
})

describe('déblocages enregistrés : un badge débloqué le reste (décision 13)', () => {
  const nails = H('a-ongles')
  // 7 jours « Nickel », puis le 7e (aujourd'hui) corrigé en « Un peu » : le calcul ne le voit plus.
  const corrected = [...fill(nails, d(0), d(5)), ci(A, nails.id, d(6), 'unpeu')]

  it('💅 recalculé verrouillé, mais enregistré → toujours débloqué', () => {
    expect(badgesFor(A, { checkins: corrected }, d(6)).manucure.unlocked).toBe(false)
    const b = badgesFor(A, { checkins: corrected, badgeUnlocks: [unlock(A, 'manucure', d(6))] }, d(6)).manucure
    expect(b).toMatchObject({ applicable: true, unlocked: true, unlockedOn: d(6), unlockDays: [d(6)], count: 1, progress: { current: 7, target: 7 } })
  })
  it('🪶 pesée du jour corrigée sous −2 % : le palier reste, la progression suit la vraie perte', () => {
    const ref = addDays(START, -1)
    const sun = d(6)
    const w = weighIns([{ playerId: A, day: ref, weightKg: 80 }, { playerId: A, day: sun, weightKg: 78.5 }]) // −1,875 %
    expect(badgesFor(A, { weighIns: w }, sun).plume.unlocked).toBe(false)
    const b = badgesFor(A, { weighIns: w, badgeUnlocks: [unlock(A, 'plume', sun, 2)] }, sun).plume
    expect(b).toMatchObject({ unlocked: true, unlockedOn: sun, count: 1, progress: { current: 18, target: 50 } })
    expect(b.tiers?.map((t) => t.unlockedOn)).toEqual([sun, null, null])
  })
  it('unlockedOn = le plus ancien des deux', () => {
    const checkins = fill(nails, d(0), d(6))
    // Enregistré plus tôt (même obtention, recalculée plus tard) → on garde l'enregistré.
    const sport = H('a-sport')
    const W1 = weekOf(1)
    const machine = [...fill(sport, W1, addDays(W1, 3)), ci(A, sport.id, addDays(W1, 4), 'pasfait'), ci(A, sport.id, addDays(W1, 5), 'fait')]
    const m = badgesFor(A, { checkins: machine, badgeUnlocks: [unlock(A, 'machine', addDays(W1, 4))] }, addDays(W1, 5)).machine
    expect(m).toMatchObject({ unlockedOn: addDays(W1, 4), unlockDays: [addDays(W1, 4)], count: 1 })
    // Enregistré plus tard qu'une obtention calculée : rien ne change.
    const b = badgesFor(A, { checkins, badgeUnlocks: [unlock(A, 'manucure', d(9))] }, d(9)).manucure
    expect(b).toMatchObject({ unlockedOn: d(6), unlockDays: [d(6)], count: 1 })
  })
  it('une obtention perdue puis une nouvelle : les deux comptent', () => {
    const checkins = [...corrected, ...fill(nails, d(7), d(13))]
    const b = badgesFor(A, { checkins, badgeUnlocks: [unlock(A, 'manucure', d(6))] }, d(13)).manucure
    expect(b).toMatchObject({ unlockedOn: d(6), unlockDays: [d(6), d(13)], count: 2 })
  })
  it('seulement les déblocages du joueur', () => {
    expect(badgesFor(A, { checkins: corrected, badgeUnlocks: [unlock(L, 'manucure', d(6))] }, d(6)).manucure.unlocked).toBe(false)
  })
  it('un badge enregistré reste affiché même s’il ne concerne plus le joueur', () => {
    const b = badgesFor(L, { badgeUnlocks: [unlock(L, 'manucure', d(3))] }, d(6)).manucure
    expect(b).toMatchObject({ applicable: true, unlocked: true, unlockedOn: d(3), count: 1 })
  })
  it('snapshot sans badgeUnlocks (ancienne source) : pas de plantage', () => {
    const snapshot = { ...makeSnapshot({ checkins: fill(nails, d(0), d(6)) }), badgeUnlocks: undefined } as unknown as DuelSnapshot
    const list = computeBadges(A, snapshot, buildSeason(snapshot, d(6)), d(6))
    expect(list.find((b) => b.id === 'manucure')?.unlocked).toBe(true)
  })
})

describe('début du duel un autre jour qu’un lundi', () => {
  it('les badges partent du lundi de la première manche, comme buildSeason', () => {
    const checkins = fillPlayer(habits, A, d(0), d(6))
    const b = badgesFor(A, { seasonStart: d(2), habits, checkins }, d(6)).assidu
    expect(b).toMatchObject({ unlocked: true, unlockedOn: d(6) })
  })
})

describe('badgeUnlocksToRecord', () => {
  const ref = addDays(START, -1)
  const sun = d(6)
  const input = (badgeUnlocks: BadgeUnlock[] = []): SnapshotInput => ({
    checkins: fill(H('a-ongles'), d(0), d(6)),
    weighIns: weighIns([{ playerId: A, day: ref, weightKg: 80 }, { playerId: A, day: sun, weightKg: 75.9 }]),
    badgeUnlocks,
  })
  const toRecord = (inp: SnapshotInput, player = A) => {
    const snapshot = makeSnapshot(inp)
    return badgeUnlocksToRecord(player, computeBadges(player, snapshot, buildSeason(snapshot, sun), sun), snapshot.badgeUnlocks)
  }

  it('un badge = une ligne (sa première obtention), un palier 🪶 = une ligne', () => {
    expect(toRecord(input())).toEqual([unlock(A, 'manucure', sun), unlock(A, 'plume', sun, 2), unlock(A, 'plume', sun, 5)])
  })
  it('ce qui est déjà enregistré n’est pas réenregistré', () => {
    expect(toRecord(input([unlock(A, 'manucure', sun), unlock(A, 'plume', sun, 2)]))).toEqual([unlock(A, 'plume', sun, 5)])
  })
  it('les déblocages de l’autre ne comptent pas', () => {
    expect(toRecord(input([unlock(L, 'manucure', sun)]))).toContainEqual(unlock(A, 'manucure', sun))
  })
  it('idempotent : une fois enregistré, plus rien à enregistrer', () => {
    const first = toRecord(input())
    expect(toRecord(input(first))).toEqual([])
  })
  it('rien de débloqué → rien à enregistrer', () => {
    expect(toRecord({}, L)).toEqual([])
  })
})
