/**
 * 🧮 Logique de score — module pur (aucune dépendance à l'interface ni à la base).
 * Toutes les valeurs viennent de src/config/rules.ts.
 */
import { RULES, type Rules } from '../config/rules'
import { addDays, diffDays, isoDayOf, weekDays, weekStartOf } from './dates'
import type {
  Checkin,
  CheckinValue,
  DayKey,
  GameSettings,
  Habit,
  HabitKind,
  PlayerId,
  WeighIn,
} from './types'

// ─── Check-in ──────────────────────────────────────────────────────────────

/** Points d'une réponse de check-in (0 si la valeur ne correspond pas au type). */
export function pointsFor(kind: HabitKind, value: CheckinValue | null | undefined, rules: Rules = RULES): number {
  if (!value) return 0
  if (kind === 'avoid') {
    return value in rules.checkin.avoid ? rules.checkin.avoid[value as keyof Rules['checkin']['avoid']] : 0
  }
  return value in rules.checkin.do ? rules.checkin.do[value as keyof Rules['checkin']['do']] : 0
}

/** Points maximum d'une habitude. */
export function maxPointsFor(kind: HabitKind, rules: Rules = RULES): number {
  return kind === 'avoid'
    ? Math.max(...Object.values(rules.checkin.avoid))
    : Math.max(...Object.values(rules.checkin.do))
}

/** Les réponses possibles pour un type d'habitude, de la meilleure à la pire. */
export function valuesFor(kind: HabitKind): CheckinValue[] {
  return kind === 'avoid' ? ['nickel', 'unpeu', 'craquage'] : ['fait', 'pasfait']
}

/** L'habitude compte-t-elle ce jour-là ? */
export function isHabitActiveOn(habit: Habit, day: DayKey): boolean {
  return habit.activeFrom <= day && (habit.activeUntil === null || day < habit.activeUntil)
}

/** Habitudes d'un joueur qui comptent ce jour-là, dans l'ordre d'affichage. */
export function activeHabits(habits: Habit[], playerId: PlayerId, day: DayKey): Habit[] {
  return habits
    .filter((h) => h.playerId === playerId && isHabitActiveOn(h, day))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Index rapide des check-ins : clé `${playerId}|${habitId}|${day}`. */
export type CheckinIndex = Map<string, Checkin>

export function checkinKey(playerId: PlayerId, habitId: string, day: DayKey): string {
  return `${playerId}|${habitId}|${day}`
}

export function indexCheckins(checkins: Checkin[]): CheckinIndex {
  const map: CheckinIndex = new Map()
  for (const c of checkins) map.set(checkinKey(c.playerId, c.habitId, c.day), c)
  return map
}

export interface DayScore {
  day: DayKey
  /** Points obtenus. */
  points: number
  /** Points possibles. */
  possible: number
  /** Score du jour sur 100, arrondi à l'entier (c'est cette valeur qui compte). */
  score: number
  /** Nombre d'habitudes remplies / à remplir. */
  filled: number
  total: number
  /** Toutes les habitudes sont remplies (✅ sur le Ring). */
  complete: boolean
  /** Journée parfaite : 100/100. */
  perfect: boolean
}

/**
 * Score d'un joueur pour un jour : points obtenus ÷ points possibles × 100.
 * Une habitude non remplie vaut 0 pt, donc un jour oublié vaut 0.
 */
export function dailyScore(
  playerId: PlayerId,
  day: DayKey,
  habits: Habit[],
  checkins: CheckinIndex,
  rules: Rules = RULES,
): DayScore {
  const list = activeHabits(habits, playerId, day)
  let points = 0
  let possible = 0
  let filled = 0
  for (const h of list) {
    possible += maxPointsFor(h.kind, rules)
    const c = checkins.get(checkinKey(playerId, h.id, day))
    if (c) {
      filled++
      points += pointsFor(h.kind, c.value, rules)
    }
  }
  const score = possible > 0 ? Math.round((points / possible) * rules.week.dailyMax) : 0
  return {
    day,
    points,
    possible,
    score,
    filled,
    total: list.length,
    complete: list.length > 0 && filled === list.length,
    perfect: possible > 0 && points === possible,
  }
}

// ─── Fenêtres de saisie ────────────────────────────────────────────────────

/**
 * Peut-on remplir ou corriger le check-in de `day` quand on est `today` ?
 * Aujourd'hui et hier seulement, et jamais par-dessus la fin d'une manche.
 */
export function canEditCheckin(
  day: DayKey,
  today: DayKey,
  settings: Pick<GameSettings, 'seasonStart'>,
  rules: Rules = RULES,
): boolean {
  const back = diffDays(day, today)
  if (back < 0 || back > rules.checkin.catchUpDays) return false
  if (day < settings.seasonStart) return false
  if (!rules.checkin.catchUpAcrossWeeks && weekStartOf(day) !== weekStartOf(today)) return false
  return true
}

/** Jour de la pesée (1 = lundi … 7 = dimanche) en vigueur pour la manche qui contient `day`. */
export function weighInDayFor(day: DayKey, settings: Pick<GameSettings, 'weighInDays'>, rules: Rules = RULES): number {
  const monday = weekStartOf(day)
  let isoDay: number = rules.weighIn.defaultDay
  let best = ''
  for (const r of settings.weighInDays) {
    if (r.from <= monday && r.from >= best) {
      best = r.from
      isoDay = r.isoDay
    }
  }
  return isoDay
}

/** La date de la pesée de la manche qui commence ce lundi. */
export function weighInDateOfWeek(weekStart: DayKey, settings: Pick<GameSettings, 'weighInDays'>, rules: Rules = RULES): DayKey {
  return addDays(weekStart, weighInDayFor(weekStart, settings, rules) - 1)
}

/** Est-ce le jour de la pesée ? */
export function isWeighInDay(day: DayKey, settings: Pick<GameSettings, 'weighInDays'>, rules: Rules = RULES): boolean {
  return isoDayOf(day) === weighInDayFor(day, settings, rules)
}

/** Peut-on enregistrer une pesée aujourd'hui ? (le jour J uniquement, si la règle est active) */
export function canWeighIn(today: DayKey, settings: Pick<GameSettings, 'weighInDays'>, rules: Rules = RULES): boolean {
  return !rules.weighIn.onlyOnWeighInDay || isWeighInDay(today, settings, rules)
}

// ─── Pesée ─────────────────────────────────────────────────────────────────

/**
 * Variation en % entre deux poids (négatif = perte).
 * Exemple : 80 → 79,2 kg = -1 %.
 */
export function percentChange(fromKg: number, toKg: number): number {
  return ((toKg - fromKg) / fromKg) * 100
}

/**
 * Points de la pesée :
 * - toute première pesée (changePct = null) : 0, elle sert de point de départ ;
 * - perte ≥ 1 % : 100 pts (plafond voulu) ; entre 0 et -1 % : proportionnel ;
 * - stable ou en hausse : 0 ;
 * - à ±1 % de l'objectif : 100 pts. On garde le meilleur des deux calculs.
 */
export function weighInPoints(
  w: Pick<WeighIn, 'changePct' | 'goalDistancePct'> | null | undefined,
  rules: Rules = RULES,
): number {
  if (!w || w.changePct === null) return 0
  const { maxPoints, fullPointsLossPct, goalTolerancePct } = rules.weighIn
  const loss = -w.changePct
  const fromChange = loss <= 0 ? 0 : Math.min(maxPoints, (loss / fullPointsLossPct) * maxPoints)
  // Petite tolérance numérique pour les flottants (ex. 0.99999999 %).
  const inGoalZone = w.goalDistancePct !== null && Math.abs(w.goalDistancePct) <= goalTolerancePct + 1e-9
  const fromGoal = inGoalZone ? maxPoints : 0
  return Math.round(Math.max(fromChange, fromGoal))
}

/** La pesée d'un joueur dans une manche (la dernière si jamais il y en avait plusieurs). */
export function weighInOfWeek(weighIns: WeighIn[], playerId: PlayerId, weekStart: DayKey): WeighIn | null {
  const days = new Set(weekDays(weekStart))
  let found: WeighIn | null = null
  for (const w of weighIns) {
    if (w.playerId === playerId && days.has(w.day) && (!found || w.day > found.day)) found = w
  }
  return found
}

// ─── Manche ────────────────────────────────────────────────────────────────

export interface PlayerWeekScore {
  playerId: PlayerId
  /** Les 7 jours, du lundi au dimanche. */
  days: DayScore[]
  /** Somme des 7 jours (max 700). */
  daysTotal: number
  weighIn: WeighIn | null
  /** Points de pesée (max 100). */
  weighInPoints: number
  /** Score de la semaine (max 800). */
  total: number
}

export interface ScoringData {
  habits: Habit[]
  checkins: CheckinIndex
  weighIns: WeighIn[]
}

/**
 * Score d'un joueur sur une manche. Si `upTo` est donné, les jours après `upTo`
 * ne comptent pas encore (utile pour la remontada : le score du jeudi soir).
 */
export function playerWeekScore(
  playerId: PlayerId,
  weekStart: DayKey,
  data: ScoringData,
  rules: Rules = RULES,
  upTo?: DayKey,
): PlayerWeekScore {
  const days = weekDays(weekStart).map((day) =>
    upTo !== undefined && day > upTo
      ? { day, points: 0, possible: 0, score: 0, filled: 0, total: 0, complete: false, perfect: false }
      : dailyScore(playerId, day, data.habits, data.checkins, rules),
  )
  const daysTotal = days.reduce((sum, d) => sum + d.score, 0)
  const w = weighInOfWeek(data.weighIns, playerId, weekStart)
  const counted = w && (upTo === undefined || w.day <= upTo) ? w : null
  const wPoints = weighInPoints(counted, rules)
  return { playerId, days, daysTotal, weighIn: counted, weighInPoints: wPoints, total: daysTotal + wPoints }
}

export interface WeekOutcome {
  /** Gagnant, ou `null` en cas d'égalité. */
  winnerId: PlayerId | null
  /** Ceux qui font le gage : le perdant, ou les deux en cas d'égalité. */
  gageFor: PlayerId[]
  tie: boolean
  /** Écart de points (toujours ≥ 0). */
  gap: number
}

/** Le plus haut score gagne. En cas d'égalité, gage pour les deux. */
export function weekOutcome(a: PlayerWeekScore, b: PlayerWeekScore): WeekOutcome {
  if (a.total === b.total) {
    return { winnerId: null, gageFor: [a.playerId, b.playerId], tie: true, gap: 0 }
  }
  const [winner, loser] = a.total > b.total ? [a, b] : [b, a]
  return { winnerId: winner.playerId, gageFor: [loser.playerId], tie: false, gap: winner.total - loser.total }
}
