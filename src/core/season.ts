/**
 * Vue d'ensemble du duel : manches, gagnants, bilan global. Module pur.
 */
import { RULES, type Rules } from '../config/rules'
import { addDays, diffDays, weekDays, weekEndOf, weekStartOf } from './dates'
import {
  indexCheckins,
  playerWeekScore,
  weekOutcome,
  type PlayerWeekScore,
  type ScoringData,
  type WeekOutcome,
} from './scoring'
import type { DayKey, DuelSnapshot, PlayerId, WeekMeta } from './types'

export interface WeekView {
  weekStart: DayKey
  weekEnd: DayKey
  days: DayKey[]
  /** Score de chaque joueur (jours à venir = 0). */
  scores: Record<PlayerId, PlayerWeekScore>
  /** Manche terminée (on est après le dimanche 23:59). */
  finished: boolean
  /** Classement actuel (provisoire si la manche est en cours). */
  outcome: WeekOutcome
  meta: WeekMeta | null
  /** Jours restants, aujourd'hui compris (0 si terminée). */
  daysLeft: number
  /** Numéro de la manche (1 = première). */
  index: number
}

export interface SeasonRecord {
  wins: Record<PlayerId, number>
  ties: number
  played: number
  /** Série de victoires en cours (sur les manches terminées). */
  streak: { playerId: PlayerId | null; count: number }
}

export interface Season {
  /** Toutes les manches depuis le début, jusqu'à la manche en cours incluse. */
  weeks: WeekView[]
  /** La manche en cours (ou la première si le duel n'a pas commencé). */
  current: WeekView
  /** Manches terminées uniquement. */
  finished: WeekView[]
  record: SeasonRecord
  /** Le duel n'a pas encore commencé (avant le premier lundi). */
  notStarted: boolean
  data: ScoringData
}

export function scoringData(snapshot: DuelSnapshot): ScoringData {
  return { habits: snapshot.habits, checkins: indexCheckins(snapshot.checkins), weighIns: snapshot.weighIns }
}

function buildWeek(
  snapshot: DuelSnapshot,
  data: ScoringData,
  weekStart: DayKey,
  today: DayKey,
  index: number,
  rules: Rules,
): WeekView {
  const weekEnd = weekEndOf(weekStart)
  const finished = today > weekEnd
  // Les jours futurs ne sont pas encore joués : on coupe à aujourd'hui.
  const upTo = finished ? undefined : today
  const [a, b] = snapshot.players
  const scores: Record<PlayerId, PlayerWeekScore> = {
    [a.id]: playerWeekScore(a.id, weekStart, data, rules, upTo),
    [b.id]: playerWeekScore(b.id, weekStart, data, rules, upTo),
  }
  const daysLeft = finished ? 0 : today < weekStart ? rules.week.days : diffDays(today, weekEnd) + 1
  return {
    weekStart,
    weekEnd,
    days: weekDays(weekStart),
    scores,
    finished,
    outcome: weekOutcome(scores[a.id], scores[b.id]),
    meta: snapshot.weeks.find((w) => w.weekStart === weekStart) ?? null,
    daysLeft,
    index,
  }
}

/** Calcule toutes les manches et le bilan global. */
export function buildSeason(snapshot: DuelSnapshot, today: DayKey, rules: Rules = RULES): Season {
  const data = scoringData(snapshot)
  const first = weekStartOf(snapshot.settings.seasonStart)
  const notStarted = today < first
  const lastStart = notStarted ? first : weekStartOf(today)
  const weeks: WeekView[] = []
  for (let ws = first, i = 1; ws <= lastStart; ws = addDays(ws, 7), i++) {
    weeks.push(buildWeek(snapshot, data, ws, today, i, rules))
  }
  const finished = weeks.filter((w) => w.finished)
  return {
    weeks,
    current: weeks[weeks.length - 1],
    finished,
    record: seasonRecord(snapshot.players.map((p) => p.id), finished),
    notStarted,
    data,
  }
}

/** Bilan global : « Laetitia 4 – 2 Arthus ». */
export function seasonRecord(playerIds: PlayerId[], finishedWeeks: WeekView[]): SeasonRecord {
  const wins: Record<PlayerId, number> = Object.fromEntries(playerIds.map((id) => [id, 0]))
  let ties = 0
  let streak: SeasonRecord['streak'] = { playerId: null, count: 0 }
  for (const w of finishedWeeks) {
    const winner = w.outcome.winnerId
    if (winner) {
      wins[winner] = (wins[winner] ?? 0) + 1
      streak = streak.playerId === winner ? { playerId: winner, count: streak.count + 1 } : { playerId: winner, count: 1 }
    } else {
      ties++
      streak = { playerId: null, count: 0 }
    }
  }
  return { wins, ties, played: finishedWeeks.length, streak }
}

/**
 * La manche dont le joueur doit voir la cérémonie : la dernière manche terminée,
 * si elle n'a pas encore été vue.
 */
export function pendingResultsWeek(season: Season, seen: DayKey[]): WeekView | null {
  const last = season.finished[season.finished.length - 1]
  if (!last || seen.includes(last.weekStart)) return null
  return last
}

/** L'enjeu de cette manche est-il encore modifiable aujourd'hui ? */
export function isStakeEditable(weekStart: DayKey, today: DayKey, rules: Rules = RULES): boolean {
  const d = diffDays(weekStart, today)
  return d >= 0 && d < rules.stake.editableDays
}
