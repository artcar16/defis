/**
 * Génère 3 manches fictives + la manche en cours, relativement à « aujourd'hui ».
 * Déterministe (graine fixe) pour que la maquette soit stable d'un chargement à l'autre.
 *
 * Scénario :
 * - Manche 1 : Laetitia gagne.
 * - Manche 2 : Arthus est mené le jeudi soir puis gagne → 🚀 Remontada.
 * - Manche 3 : Laetitia gagne (gage d'Arthus pas encore payé).
 * - Manche en cours : jours passés remplis, aujourd'hui vide pour les deux.
 */
import { DEFAULT_GAGES, DEFAULT_HABITS, DEFAULT_PLAYERS } from '../../config/defaults'
import { addDays, daysRange, weekDays, weekStartOf } from '../../core/dates'
import { indexCheckins, playerWeekScore, weighInDateOfWeek } from '../../core/scoring'
import type { Checkin, CheckinValue, DayKey, GameSettings, Habit, Player, PlayerId, Proposal, WeekMeta } from '../../core/types'
import { deriveWeighIns, type RawWeighIn } from '../../core/weight'

export interface DemoPlayer extends Omit<Player, 'goalKg' | 'goalFromStartPct'> {
  key: 'laetitia' | 'arthus'
}

export interface GoalRule {
  playerId: PlayerId
  from: DayKey
  kg: number | null
}

/** L'état complet de la démo (qui connaît tout, y compris les kilos des deux). */
export interface DemoState {
  version: 1
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
  seenResults: Record<PlayerId, DayKey[]>
  /** Le check-in automatique de l'adversaire a-t-il déjà été simulé aujourd'hui ? */
  otherAutoCheckinDone: boolean
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

/** Probabilités [nickel, un peu] (le reste = craquage) ou [fait] par joueur et habitude. */
const PROFILES: Record<string, Record<string, number[]>> = {
  arthus: { ongles: [0.55, 0.3], grignotage: [0.6, 0.25], sport: [0.55] },
  laetitia: { grattage: [0.62, 0.28], grignotage: [0.5, 0.3], sport: [0.65] },
}

function pick(rng: () => number, habit: Habit, playerKey: string): CheckinValue {
  const p = PROFILES[playerKey]?.[habit.badgeKey ?? ''] ?? (habit.kind === 'avoid' ? [0.6, 0.25] : [0.6])
  const r = rng()
  if (habit.kind === 'do') return r < p[0] ? 'fait' : 'pasfait'
  return r < p[0] ? 'nickel' : r < p[0] + p[1] ? 'unpeu' : 'craquage'
}

const BEST: Record<Habit['kind'], CheckinValue> = { avoid: 'nickel', do: 'fait' }
const WORST: Record<Habit['kind'], CheckinValue> = { avoid: 'craquage', do: 'pasfait' }

export function generateDemoState(today: DayKey, anchorReal: DayKey, meId: PlayerId = 'arthus'): DemoState {
  const rng = makeRng(hashSeed(`duel-${weekStartOf(today)}`))
  const currentWeek = weekStartOf(today)
  const seasonStart = addDays(currentWeek, -21)
  const refDay = addDays(seasonStart, -1) // pesée de départ : le dimanche d'avant

  const players: DemoPlayer[] = DEFAULT_PLAYERS.map((p) => ({
    key: p.key,
    id: p.key,
    name: p.name,
    emoji: p.emoji,
    color: p.color,
    showKg: false,
  }))

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

  // ─── Check-ins des jours passés ───
  const checkins = new Map<string, Checkin>()
  const set = (playerId: PlayerId, habitId: string, day: DayKey, value: CheckinValue) => {
    checkins.set(`${playerId}|${habitId}|${day}`, { playerId, habitId, day, value, updatedAt: `${day}T20:30:00.000Z` })
  }
  const yesterday = addDays(today, -1)
  for (const day of daysRange(seasonStart, yesterday)) {
    for (const p of players) {
      if (rng() < 0.03) continue // un jour oublié de temps en temps
      for (const h of habits.filter((x) => x.playerId === p.id)) set(p.id, h.id, day, pick(rng, h, p.key))
    }
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
      for (const h of habits.filter((x) => x.playerId === p.id)) {
        if (!checkins.has(`${p.id}|${h.id}|${day}`)) set(p.id, h.id, day, pick(rng, h, p.key))
      }
    }
  }

  // ─── Pesées (le dimanche) ───
  const weights: Record<string, number[]> = {
    arthus: [84.6, 84.0, 83.1, 83.4, 82.9],
    laetitia: [66.2, 65.7, 65.2, 64.8, 64.5],
  }
  const settings: GameSettings = {
    seasonStart,
    weighInDays: [{ from: seasonStart, isoDay: 7 }],
    gages: [...DEFAULT_GAGES],
  }
  const weighIns: RawWeighIn[] = []
  for (const p of players) {
    weighIns.push({ playerId: p.id, day: refDay, weightKg: weights[p.key][0] })
    weeks.forEach((ws, i) => weighIns.push({ playerId: p.id, day: weighInDateOfWeek(ws, settings), weightKg: weights[p.key][i + 1] }))
  }
  // Si aujourd'hui est le jour de la pesée, l'adversaire s'est déjà pesé ce matin.
  const otherId = players.find((p) => p.id !== meId)?.id ?? 'laetitia'
  if (weighInDateOfWeek(currentWeek, settings) === today) {
    weighIns.push({ playerId: otherId, day: today, weightKg: weights[otherId][4] })
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

  // ─── Manches : enjeux et gages ───
  const weekMetas: WeekMeta[] = [
    { weekStart: w1, stake: DEFAULT_GAGES[0], gagePaid: { arthus: true } },
    { weekStart: w2, stake: DEFAULT_GAGES[1], gagePaid: { laetitia: true } },
    { weekStart: w3, stake: DEFAULT_GAGES[3], gagePaid: {} },
    { weekStart: currentWeek, stake: DEFAULT_GAGES[2], gagePaid: {} },
  ]

  const proposals: Proposal[] = [
    {
      id: 'demo-proposal-eau',
      authorId: 'laetitia',
      payload: { kind: 'habit_add', name: 'Eau', emoji: '💧', hint: '1,5 L dans la journée', habitKind: 'do' },
      status: 'pending',
      createdAt: `${addDays(today, -1)}T19:12:00.000Z`,
      decidedAt: null,
      effectiveFrom: null,
    },
  ]

  return {
    version: 1,
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
    otherAutoCheckinDone: false,
  }
}
