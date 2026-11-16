/**
 * Données de démo : 3 manches fictives + la manche en cours, calées sur la vraie semaine.
 *
 * Déterministe : chaque jour est tiré avec sa propre graine (joueur + jour). Un jour inventé
 * au chargement ou pendant un voyage dans le temps a donc toujours les mêmes réponses, et les
 * manches passées sont identiques quel que soit le jour simulé ou le joueur connecté.
 *
 * Scénario :
 * - Manche 1 : Laetitia gagne.
 * - Manche 2 : Arthus est mené le jeudi soir puis gagne → 🚀 Remontada.
 * - Manche 3 : Laetitia gagne (gage d'Arthus pas encore payé).
 * - Manche en cours (la vraie semaine) : jours passés remplis, aujourd'hui vide pour les deux.
 *   Ma dernière habitude d'hier reste vide (pour montrer le rattrapage) et, le jour de la
 *   pesée, l'autre s'est déjà pesé ce matin.
 */
import { DEFAULT_GAGES, DEFAULT_HABITS, DEFAULT_PLAYERS } from '../../config/defaults'
import { addDays, daysRange, weekDays, weekStartOf } from '../../core/dates'
import {
  activeHabits,
  canEditCheckin,
  indexCheckins,
  isAvoidKind,
  isWeighInDay,
  playerWeekScore,
  weighInDateOfWeek,
} from '../../core/scoring'
import { drawStake } from '../../core/stake'
import type {
  BadgeUnlock,
  Checkin,
  CheckinValue,
  DayKey,
  GameSettings,
  Habit,
  Player,
  PlayerId,
  Proposal,
  WeekMeta,
} from '../../core/types'
import { deriveWeighIns, type RawWeighIn } from '../../core/weight'

export interface DemoPlayer extends Omit<Player, 'goalKg' | 'goalFromStartPct'> {
  key: 'laetitia' | 'arthus'
}

export interface GoalRule {
  playerId: PlayerId
  from: DayKey
  kg: number | null
}

/**
 * Version de l'état de la démo : un état enregistré d'une autre version est régénéré.
 * 3 : Grignotage « tout ou rien » (précision 22 de SPEC.md).
 */
export const DEMO_VERSION = 3

/** L'état complet de la démo (qui connaît tout, y compris les kilos des deux). */
export interface DemoState {
  version: typeof DEMO_VERSION
  /** Jour réel où les données ont été générées. */
  anchorReal: DayKey
  /** Jour simulé (« aujourd'hui » dans la démo). */
  today: DayKey
  meId: PlayerId
  signedIn: boolean
  players: DemoPlayer[]
  goals: GoalRule[]
  habits: Habit[]
  checkins: Checkin[]
  weighIns: RawWeighIn[]
  weeks: WeekMeta[]
  settings: GameSettings
  proposals: Proposal[]
  /** Cérémonies déjà vues, par joueur. */
  seenResults: Record<PlayerId, DayKey[]>
  /** Célébrations de badges déjà vues, par joueur. */
  seenBadges: Record<PlayerId, string[]>
  /** Badges enregistrés comme débloqués (des deux joueurs). */
  badgeUnlocks: BadgeUnlock[]
  /** Le check-in automatique de l'adversaire a-t-il déjà été simulé aujourd'hui ? */
  otherAutoCheckinDone: boolean
  /**
   * Pesée inventée « l'autre s'est déjà pesé ce matin » (jour J). Si « moi » change,
   * elle passe au nouvel « autre ». null quand il n'y en a pas.
   */
  morningWeighIn: { playerId: PlayerId; day: DayKey } | null
}

/** Petit générateur pseudo-aléatoire déterministe (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Lundi de la « manche en cours » du scénario : la vraie semaine, y compris quand on voyage
 * au lundi suivant (pour y voir la cérémonie de la manche 4). Hors de cette plage, la
 * semaine du jour demandé.
 */
export function scenarioWeek(today: DayKey, anchorReal: DayKey): DayKey {
  const real = weekStartOf(anchorReal)
  return today >= real && today <= addDays(real, 7) ? real : weekStartOf(today)
}

/** Jours où l'on peut voyager : les 7 jours de la vraie semaine + le lundi suivant. */
export function demoTravelDays(realToday: DayKey): DayKey[] {
  const monday = weekStartOf(realToday)
  return [...weekDays(monday), addDays(monday, 7)]
}

/**
 * Probabilités [nickel, un peu] (le reste = craquage) ou [fait] par joueur et habitude.
 * Tout ou rien (pas de « un peu ») : le « un peu » est partagé entre nickel et craquage
 * (mêmes points en moyenne).
 */
const PROFILES: Record<string, Record<string, number[]>> = {
  arthus: { ongles: [0.55, 0.3], grignotage: [0.6, 0.25], sport: [0.55] },
  laetitia: { grattage: [0.62, 0.28], grignotage: [0.5, 0.3], sport: [0.65] },
}

function pick(rng: () => number, habit: Habit, playerId: PlayerId): CheckinValue {
  const p = PROFILES[playerId]?.[habit.badgeKey ?? ''] ?? (isAvoidKind(habit.kind) ? [0.6, 0.25] : [0.6])
  const r = rng()
  if (habit.kind === 'do') return r < p[0] ? 'fait' : 'pasfait'
  if (habit.kind === 'avoid_strict') return r < p[0] + p[1] / 2 ? 'nickel' : 'craquage'
  return r < p[0] ? 'nickel' : r < p[0] + p[1] ? 'unpeu' : 'craquage'
}

/**
 * Le check-in inventé d'un joueur pour un jour (toutes ses habitudes actives ce jour-là).
 * Même joueur + même jour = mêmes réponses. `forget` : un jour oublié de temps en temps (3 %).
 */
export function generateDayCheckins(habits: Habit[], playerId: PlayerId, day: DayKey, opts: { forget?: boolean } = {}): Checkin[] {
  const rng = makeRng(hashSeed(`jour|${playerId}|${day}`))
  const forgotten = rng() < 0.03
  if (opts.forget && forgotten) return []
  return activeHabits(habits, playerId, day).map((h) => ({
    playerId,
    habitId: h.id,
    day,
    value: pick(rng, h, playerId),
    updatedAt: `${day}T20:30:00.000Z`,
  }))
}

/** La dernière habitude (dans l'ordre d'affichage) d'un joueur ce jour-là. */
export function lastHabitOf(habits: Habit[], playerId: PlayerId, day: DayKey): Habit | null {
  return activeHabits(habits, playerId, day).at(-1) ?? null
}

/** Poids du scénario : pesée de départ, manches 1 à 3, puis la pesée de la manche en cours. */
const WEIGHTS: Record<string, number[]> = {
  arthus: [84.6, 84.0, 83.1, 83.4, 82.9],
  laetitia: [66.2, 65.7, 65.2, 64.8, 64.5],
}

/**
 * Poids d'une pesée inventée : la suite du scénario, puis de petites variations
 * déterministes (entre −0,5 et +0,2 kg) à partir de la pesée précédente.
 */
export function demoWeight(playerId: PlayerId, day: DayKey, weighIns: RawWeighIn[]): number {
  const before = weighIns.filter((w) => w.playerId === playerId && w.day < day).sort((a, b) => (a.day < b.day ? -1 : 1))
  const scripted = WEIGHTS[playerId]?.[before.length]
  if (scripted !== undefined) return scripted
  const last = before.at(-1)?.weightKg ?? WEIGHTS[playerId]?.[0] ?? 70
  const delta = makeRng(hashSeed(`pesee|${playerId}|${day}`))() * 0.7 - 0.5
  return Math.round((last + delta) * 10) / 10
}

const BEST: Record<Habit['kind'], CheckinValue> = { avoid: 'nickel', avoid_strict: 'nickel', do: 'fait' }
const WORST: Record<Habit['kind'], CheckinValue> = { avoid: 'craquage', avoid_strict: 'craquage', do: 'pasfait' }

export function generateDemoState(today: DayKey, anchorReal: DayKey, meId: PlayerId = 'arthus'): DemoState {
  const currentWeek = scenarioWeek(today, anchorReal)
  const seasonStart = addDays(currentWeek, -21)
  const refDay = addDays(seasonStart, -1) // pesée de départ : le dimanche d'avant
  const yesterday = addDays(today, -1)

  const players: DemoPlayer[] = DEFAULT_PLAYERS.map((p) => ({
    key: p.key,
    id: p.key,
    name: p.name,
    emoji: p.emoji,
    color: p.color,
    showKg: false,
  }))
  const otherId = players.find((p) => p.id !== meId)?.id ?? 'laetitia'

  const habits: Habit[] = []
  for (const p of players) {
    DEFAULT_HABITS.filter((h) => h.owners.includes(p.key)).forEach((h, i) => {
      habits.push({
        id: `${p.id}-${h.badgeKey ?? h.name.toLowerCase()}`,
        playerId: p.id,
        name: h.name,
        hint: h.hint,
        emoji: h.emoji,
        kind: h.kind,
        badgeKey: h.badgeKey,
        activeFrom: seasonStart,
        activeUntil: null,
        sortOrder: i,
      })
    })
  }

  // ─── Check-ins des jours passés (un oubli de temps en temps dans les manches finies) ───
  const checkins = new Map<string, Checkin>()
  const keyOf = (playerId: PlayerId, habitId: string, day: DayKey) => `${playerId}|${habitId}|${day}`
  const put = (c: Checkin) => checkins.set(keyOf(c.playerId, c.habitId, c.day), c)
  const set = (playerId: PlayerId, habitId: string, day: DayKey, value: CheckinValue) =>
    put({ playerId, habitId, day, value, updatedAt: `${day}T20:30:00.000Z` })
  for (const day of daysRange(seasonStart, yesterday)) {
    for (const p of players) generateDayCheckins(habits, p.id, day, { forget: day < currentWeek }).forEach(put)
  }

  // Séries scénarisées (pour débloquer quelques badges).
  const weeks = [0, 1, 2].map((i) => addDays(seasonStart, i * 7))
  // 🧘 Zen absolu pour Laetitia : 9 jours nickel sur le grattage (manches 2 et 3).
  for (const day of daysRange(addDays(weeks[1], 3), addDays(weeks[2], 4))) set('laetitia', 'laetitia-grattage', day, 'nickel')
  // 🏋️ Machine pour Laetitia : sport 5 jours en manche 3.
  for (const day of weekDays(weeks[2]).slice(0, 5)) set('laetitia', 'laetitia-sport', day, 'fait')
  // 📅 Assidu·e pour les deux : pas de jour oublié en manche 3.
  for (const day of weekDays(weeks[2])) {
    for (const p of players) {
      for (const c of generateDayCheckins(habits, p.id, day)) {
        if (!checkins.has(keyOf(c.playerId, c.habitId, c.day))) put(c)
      }
    }
  }

  // ─── Pesées (le dimanche) ───
  const settings: GameSettings = {
    seasonStart,
    weighInDays: [{ from: seasonStart, isoDay: 7 }],
    gages: [...DEFAULT_GAGES],
  }
  const weighIns: RawWeighIn[] = []
  for (const p of players) {
    weighIns.push({ playerId: p.id, day: refDay, weightKg: demoWeight(p.id, refDay, weighIns) })
    for (const ws of weeks) {
      const day = weighInDateOfWeek(ws, settings)
      weighIns.push({ playerId: p.id, day, weightKg: demoWeight(p.id, day, weighIns) })
    }
  }
  // Jours de pesée déjà passés depuis le début de la manche en cours (voyage au lundi suivant).
  for (const day of daysRange(currentWeek, yesterday)) {
    if (!isWeighInDay(day, settings)) continue
    for (const p of players) weighIns.push({ playerId: p.id, day, weightKg: demoWeight(p.id, day, weighIns) })
  }
  // Si aujourd'hui est le jour de la pesée, l'autre s'est déjà pesé ce matin.
  let morningWeighIn: DemoState['morningWeighIn'] = null
  if (today >= currentWeek && isWeighInDay(today, settings)) {
    weighIns.push({ playerId: otherId, day: today, weightKg: demoWeight(otherId, today, weighIns) })
    morningWeighIn = { playerId: otherId, day: today }
  }
  const goals: GoalRule[] = [
    { playerId: 'arthus', from: refDay, kg: 79 },
    { playerId: 'laetitia', from: refDay, kg: 61.5 },
  ]

  // ─── Résultats forcés selon le scénario ───
  const derived = () =>
    deriveWeighIns(weighIns, (pid, day) => goals.filter((g) => g.playerId === pid && g.from <= day).at(-1)?.kg ?? null)
  const total = (pid: PlayerId, ws: DayKey, upTo?: DayKey) =>
    playerWeekScore(pid, ws, { habits, checkins: indexCheckins([...checkins.values()]), weighIns: derived() }, undefined, upTo).total

  /** Améliore `up` et dégrade `down` sur `days` jusqu'à ce que up > down + margin. */
  const force = (up: PlayerId, down: PlayerId, ws: DayKey, days: DayKey[], margin: number, upTo?: DayKey) => {
    for (const day of days) {
      if (total(up, ws, upTo) > total(down, ws, upTo) + margin) return
      for (const h of habits.filter((x) => x.playerId === up)) set(up, h.id, day, BEST[h.kind])
      // On épargne le grattage de Laetitia (série 🧘 scénarisée).
      for (const victim of habits.filter((x) => x.playerId === down && x.badgeKey !== 'grattage')) {
        if (total(up, ws, upTo) > total(down, ws, upTo) + margin) return
        set(down, victim.id, day, WORST[victim.kind])
      }
    }
  }
  const [w1, w2, w3] = weeks
  force('laetitia', 'arthus', w1, weekDays(w1).reverse(), 25)
  // Manche 2 : Arthus mené au jeudi soir, puis remontada.
  const thursday = addDays(w2, 3)
  force('laetitia', 'arthus', w2, weekDays(w2).slice(0, 4).reverse(), 20, thursday)
  force('arthus', 'laetitia', w2, weekDays(w2).slice(4), 15)
  force('laetitia', 'arthus', w3, weekDays(w3).reverse(), 30)

  // Ma dernière habitude d'hier reste vide : de quoi montrer « Hier n'est pas complet ».
  const lastYesterday = lastHabitOf(habits, meId, yesterday)
  if (lastYesterday && canEditCheckin(yesterday, today, settings)) checkins.delete(keyOf(meId, lastYesterday.id, yesterday))

  // ─── Manches : enjeux et gages (la manche en cours : tirage automatique du lundi) ───
  const weekMetas: WeekMeta[] = [
    { weekStart: w1, stake: DEFAULT_GAGES[0], gagePaid: { arthus: true } },
    { weekStart: w2, stake: DEFAULT_GAGES[1], gagePaid: { laetitia: true } },
    { weekStart: w3, stake: DEFAULT_GAGES[3], gagePaid: {} },
    { weekStart: currentWeek, stake: drawStake(settings.gages, currentWeek, DEFAULT_GAGES[3]), gagePaid: {} },
  ]

  const proposals: Proposal[] = [
    {
      id: 'demo-proposal-eau',
      authorId: 'laetitia',
      payload: { kind: 'habit_add', name: 'Eau', emoji: '💧', hint: '1,5\u00a0L dans la journée', habitKind: 'do' },
      status: 'pending',
      createdAt: `${yesterday}T19:12:00.000Z`,
      decidedAt: null,
      effectiveFrom: null,
    },
  ]

  return {
    version: DEMO_VERSION,
    anchorReal,
    today,
    meId,
    signedIn: false,
    players,
    goals,
    habits,
    checkins: [...checkins.values()],
    weighIns,
    weeks: weekMetas,
    settings,
    proposals,
    seenResults: { arthus: [w1, w2], laetitia: [w1, w2] },
    seenBadges: { arthus: [], laetitia: [] },
    badgeUnlocks: [],
    otherAutoCheckinDone: false,
    morningWeighIn,
  }
}
