/**
 * Petits constructeurs de données pour les tests de src/core (aucune dépendance à Vitest).
 */
import { DEFAULT_GAGES } from '../config/defaults'
import { addDays, daysRange } from './dates'
import { indexCheckins, type DayScore, type ScoringData } from './scoring'
import type { SeasonRecord } from './season'
import type {
  BadgeHabitKey,
  BadgeUnlock,
  Checkin,
  CheckinValue,
  DayKey,
  DuelSnapshot,
  Habit,
  HabitKind,
  Player,
  PlayerId,
  WeighIn,
  WeighInDayRule,
} from './types'
import { deriveWeighIns, type RawWeighIn } from './weight'

/** Premier lundi du duel dans les tests. */
export const START: DayKey = '2026-10-26'
export const A: PlayerId = 'arthus'
export const L: PlayerId = 'laetitia'

export function makePlayer(id: PlayerId, patch: Partial<Player> = {}): Player {
  const base: Record<string, Player> = {
    [A]: { id: A, name: 'Arthus', emoji: '🐻', color: '#2E6BFF', showKg: false, goalKg: null, goalFromStartPct: null },
    [L]: { id: L, name: 'Laetitia', emoji: '🦊', color: '#FF6F61', showKg: false, goalKg: null, goalFromStartPct: null },
  }
  return { ...(base[id] ?? { id, name: id, emoji: '🙂', color: '#888888', showKg: false, goalKg: null, goalFromStartPct: null }), ...patch }
}

export function makeHabit(
  id: string,
  playerId: PlayerId,
  kind: HabitKind,
  patch: Partial<Habit> & { badgeKey?: BadgeHabitKey | null } = {},
): Habit {
  return {
    id,
    playerId,
    name: id,
    hint: '',
    emoji: kind === 'avoid' ? '🙅' : '✅',
    kind,
    badgeKey: null,
    activeFrom: START,
    activeUntil: null,
    sortOrder: 0,
    ...patch,
  }
}

/** Les habitudes de départ : Arthus (ongles, grignotage, sport), Laetitia (grattage, grignotage, sport). */
export function defaultHabits(from: DayKey = START): Habit[] {
  return [
    makeHabit('a-ongles', A, 'avoid', { name: 'Ongles', emoji: '💅', badgeKey: 'ongles', activeFrom: from, sortOrder: 0 }),
    makeHabit('a-grignotage', A, 'avoid', { name: 'Grignotage', emoji: '🍪', badgeKey: 'grignotage', activeFrom: from, sortOrder: 1 }),
    makeHabit('a-sport', A, 'do', { name: 'Sport', emoji: '🏃', badgeKey: 'sport', activeFrom: from, sortOrder: 2 }),
    makeHabit('l-grattage', L, 'avoid', { name: 'Grattage', emoji: '🦟', badgeKey: 'grattage', activeFrom: from, sortOrder: 0 }),
    makeHabit('l-grignotage', L, 'avoid', { name: 'Grignotage', emoji: '🍪', badgeKey: 'grignotage', activeFrom: from, sortOrder: 1 }),
    makeHabit('l-sport', L, 'do', { name: 'Sport', emoji: '🏃', badgeKey: 'sport', activeFrom: from, sortOrder: 2 }),
  ]
}

export function ci(playerId: PlayerId, habitId: string, day: DayKey, value: CheckinValue): Checkin {
  return { playerId, habitId, day, value, updatedAt: `${day}T20:00:00.000Z` }
}

/** La meilleure valeur pour un type d'habitude. */
export function best(kind: HabitKind): CheckinValue {
  return kind === 'avoid' ? 'nickel' : 'fait'
}

/** Remplit une habitude sur une plage de jours avec la même valeur (par défaut : la meilleure). */
export function fill(habit: Habit, from: DayKey, to: DayKey, value: CheckinValue = best(habit.kind)): Checkin[] {
  return daysRange(from, to).map((day) => ci(habit.playerId, habit.id, day, value))
}

/** Remplit toutes les habitudes d'un joueur sur une plage (valeur choisie par habitude et jour). */
export function fillPlayer(
  habits: Habit[],
  playerId: PlayerId,
  from: DayKey,
  to: DayKey,
  value: (h: Habit, day: DayKey) => CheckinValue | null = (h) => best(h.kind),
): Checkin[] {
  const out: Checkin[] = []
  for (const day of daysRange(from, to)) {
    for (const h of habits.filter((x) => x.playerId === playerId)) {
      const v = value(h, day)
      if (v) out.push(ci(playerId, h.id, day, v))
    }
  }
  return out
}

/** Pesées « publiques » à partir de kilos (objectifs facultatifs, fixes). */
export function weighIns(raw: RawWeighIn[], goals: Record<PlayerId, number | null> = {}): WeighIn[] {
  return deriveWeighIns(raw, (pid) => goals[pid] ?? null)
}

export interface SnapshotInput {
  meId?: PlayerId
  players?: Player[]
  habits?: Habit[]
  checkins?: Checkin[]
  weighIns?: WeighIn[]
  seasonStart?: DayKey
  weighInDays?: WeighInDayRule[]
  seenResults?: DayKey[]
  badgeUnlocks?: BadgeUnlock[]
  seenBadges?: string[]
}

export function makeSnapshot(input: SnapshotInput = {}): DuelSnapshot {
  const seasonStart = input.seasonStart ?? START
  return {
    meId: input.meId ?? A,
    players: input.players ?? [makePlayer(L), makePlayer(A)],
    habits: input.habits ?? defaultHabits(seasonStart),
    checkins: input.checkins ?? [],
    weighIns: input.weighIns ?? [],
    weeks: [],
    settings: {
      seasonStart,
      weighInDays: input.weighInDays ?? [{ from: seasonStart, isoDay: 7 }],
      gages: [...DEFAULT_GAGES],
    },
    proposals: [],
    seenResults: input.seenResults ?? [],
    badgeUnlocks: input.badgeUnlocks ?? [],
    seenBadges: input.seenBadges ?? [],
  }
}

export function scoringDataOf(habits: Habit[], checkins: Checkin[], w: WeighIn[] = []): ScoringData {
  return { habits, checkins: indexCheckins(checkins), weighIns: w }
}

/** Un DayScore factice (pour les phrases). */
export function dayScore(patch: Partial<DayScore> = {}): DayScore {
  return {
    day: START,
    points: 0,
    possible: 30,
    score: 0,
    filled: 0,
    total: 3,
    complete: false,
    perfect: false,
    ...patch,
  }
}

export function emptyRecord(patch: Partial<SeasonRecord> = {}): SeasonRecord {
  return { wins: { [A]: 0, [L]: 0 }, ties: 0, played: 0, streak: { playerId: null, count: 0 }, ...patch }
}

/** Les jours d'une manche (lundi → dimanche) à partir d'un numéro de manche (1 = première). */
export function weekOf(n: number, seasonStart: DayKey = START): DayKey {
  return addDays(seasonStart, (n - 1) * 7)
}
