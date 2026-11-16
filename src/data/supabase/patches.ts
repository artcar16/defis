/**
 * Effets optimistes (garantie 1 de source.ts) : ce que chaque action change dans le snapshot
 * du joueur connecté, AVANT la réponse du serveur. Module pur : chaque fonction renvoie un
 * nouveau snapshot (l'ancien n'est jamais modifié). Les règles restent celles du serveur :
 * s'il refuse, SupabaseSource relit tout et l'effet disparaît.
 */
import { percentChange } from '../../core/scoring'
import type { CheckinValue, DayKey, DuelSnapshot, PlayerId, WeighIn } from '../../core/types'
import { deriveWeighIns, type RawWeighIn } from '../../core/weight'
import type { HabitLookPatch, ProfilePatch } from '../source'

function byDayThenPlayer(a: WeighIn, b: WeighIn): number {
  return a.day < b.day ? -1 : a.day > b.day ? 1 : a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0
}

/** Remplit / corrige (value null = efface) une de MES habitudes. */
export function withCheckin(s: DuelSnapshot, day: DayKey, habitId: string, value: CheckinValue | null, at: string): DuelSnapshot {
  const me = s.meId
  const others = s.checkins.filter((c) => !(c.playerId === me && c.habitId === habitId && c.day === day))
  return { ...s, checkins: value ? [...others, { playerId: me, habitId, day, value, updatedAt: at }] : others }
}

/** Arrondi à 0,1 kg, comme le serveur. */
export function roundKg(kg: number): number {
  return Math.round(kg * 10) / 10
}

/**
 * Enregistre / corrige MA pesée du jour et recalcule mes % (deriveWeighIns). L'objectif du
 * jour de la pesée est celui en vigueur aujourd'hui (on ne se pèse que le jour même) ; les
 * autres pesées gardent leur écart à l'objectif (l'historique des objectifs ne change pas).
 */
export function withWeighIn(s: DuelSnapshot, day: DayKey, weightKg: number): DuelSnapshot {
  const me = s.meId
  const meNow = s.players.find((p) => p.id === me)
  const goal = meNow?.goalKg ?? null
  const mineBefore = s.weighIns.filter((w) => w.playerId === me)
  const raw: RawWeighIn[] = mineBefore
    .filter((w) => w.day !== day && w.weightKg !== null)
    .map((w) => ({ playerId: me, day: w.day, weightKg: w.weightKg as number }))
  raw.push({ playerId: me, day, weightKg: roundKg(weightKg) })
  const oldGoalDistance = new Map(mineBefore.map((w) => [w.day, w.goalDistancePct]))
  const mine = deriveWeighIns(raw, (_pid, d) => (d === day ? goal : null)).map((w) =>
    w.day === day ? w : { ...w, goalDistancePct: oldGoalDistance.get(w.day) ?? null },
  )
  const first = raw.reduce((a, b) => (b.day < a.day ? b : a))
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === me ? { ...p, goalFromStartPct: goal !== null ? percentChange(first.weightKg, goal) : p.goalFromStartPct } : p,
    ),
    weighIns: [...s.weighIns.filter((w) => w.playerId !== me), ...mine].sort(byDayThenPlayer),
  }
}

/** Prénom, avatar, couleur, montrer mes kilos. */
export function withProfile(s: DuelSnapshot, patch: ProfilePatch): DuelSnapshot {
  return { ...s, players: s.players.map((p) => (p.id === s.meId ? { ...p, ...patch } : p)) }
}

/** Nom / emoji / précision d'une de MES habitudes. */
export function withHabitLook(s: DuelSnapshot, habitId: string, patch: HabitLookPatch): DuelSnapshot {
  return { ...s, habits: s.habits.map((h) => (h.id === habitId && h.playerId === s.meId ? { ...h, ...patch } : h)) }
}

export function withResultsSeen(s: DuelSnapshot, weekStart: DayKey): DuelSnapshot {
  return s.seenResults.includes(weekStart) ? s : { ...s, seenResults: [...s.seenResults, weekStart] }
}

export function withBadgesSeen(s: DuelSnapshot, keys: string[]): DuelSnapshot {
  const fresh = [...new Set(keys)].filter((k) => !s.seenBadges.includes(k))
  return fresh.length === 0 ? s : { ...s, seenBadges: [...s.seenBadges, ...fresh] }
}

/** « Gage payé ✅ » (validé par l'autre) pour un joueur et une manche. */
export function withGagePaid(s: DuelSnapshot, weekStart: DayKey, playerId: PlayerId, paid: boolean): DuelSnapshot {
  const exists = s.weeks.some((w) => w.weekStart === weekStart)
  const weeks = exists
    ? s.weeks.map((w) => (w.weekStart === weekStart ? { ...w, gagePaid: { ...w.gagePaid, [playerId]: paid } } : w))
    : [...s.weeks, { weekStart, stake: null, gagePaid: { [playerId]: paid } }].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
  return { ...s, weeks }
}
