/**
 * Séries 🔥, records et calendriers par habitude. Module pur.
 *
 * Règles des séries (décision 13 de SPEC.md) :
 * - un jour réussi (😇 Nickel ou 💪 Fait) allonge la série ;
 * - un jour raté OU un jour passé non rempli la casse ;
 * - aujourd'hui pas encore rempli (ou rempli à moitié) ne la casse pas : on a jusqu'à minuit ;
 * - les jours où l'habitude ne compte pas (inactive) sont ignorés ;
 * - rien après aujourd'hui n'est compté.
 */
import { daysRange } from './dates'
import { activeHabits, checkinKey, isHabitActiveOn, type CheckinIndex } from './scoring'
import type { CheckinValue, DayKey, Habit, PlayerId } from './types'

/** Statut d'une case de calendrier. */
export type DayStatus = CheckinValue | 'empty' | 'inactive' | 'future'

export interface CalendarCell {
  day: DayKey
  status: DayStatus
}

/** Une journée « réussie » pour la série : Nickel (à éviter) ou Fait (à faire). */
export function isSuccess(value: CheckinValue | null | undefined): boolean {
  return value === 'nickel' || value === 'fait'
}

/** Calendrier d'une habitude entre deux dates incluses. */
export function habitCalendar(habit: Habit, checkins: CheckinIndex, from: DayKey, to: DayKey, today: DayKey): CalendarCell[] {
  return daysRange(from, to).map((day) => {
    if (day > today) return { day, status: 'future' as const }
    if (!isHabitActiveOn(habit, day)) return { day, status: 'inactive' as const }
    const c = checkins.get(checkinKey(habit.playerId, habit.id, day))
    return { day, status: c ? c.value : ('empty' as const) }
  })
}

export interface StreakInfo {
  /** Série en cours (jours d'affilée réussis, en remontant depuis aujourd'hui). */
  current: number
  /** Meilleure série jamais faite. */
  record: number
  /** Dernier jour de la meilleure série. */
  recordEnd: DayKey | null
}

/**
 * Verdict d'un jour pour une série :
 * - 'ok' : réussi, la série continue ;
 * - 'fail' : raté, la série est cassée (même aujourd'hui) ;
 * - 'empty' : rien de rempli, 'pending' : rempli à moitié → cassent la série,
 *   sauf aujourd'hui (on a jusqu'à minuit) ;
 * - 'skip' : le jour ne compte pas (habitude inactive) : ni casse, ni compte.
 */
export type DayVerdict = 'ok' | 'fail' | 'empty' | 'pending' | 'skip'

export interface StreakScan extends StreakInfo {
  /** Jour où la série a atteint `target` jours pour la première fois (null si jamais). */
  reachedOn: DayKey | null
  /**
   * Nombre de fois où `target` jours d'affilée ont été enchaînés
   * (une série de 14 jours compte 2 fois pour un objectif de 7).
   */
  blocks: number
}

/**
 * Parcourt les jours de `from` à `today` inclus et calcule séries, record et,
 * si `target` est donné, le premier jour où la série l'atteint.
 */
export function scanStreak(from: DayKey, today: DayKey, judge: (day: DayKey) => DayVerdict, target?: number): StreakScan {
  let run = 0
  let record = 0
  let recordEnd: DayKey | null = null
  let reachedOn: DayKey | null = null
  let blocks = 0
  for (const day of daysRange(from, today)) {
    const verdict = judge(day)
    if (verdict === 'skip') continue
    if (verdict === 'ok') {
      run++
      if (run > record) {
        record = run
        recordEnd = day
      }
      if (target !== undefined && target > 0 && run % target === 0) {
        blocks++
        reachedOn ??= day
      }
    } else if (!(day === today && (verdict === 'empty' || verdict === 'pending'))) {
      run = 0
    }
  }
  // Aujourd'hui en attente ne remet pas `run` à zéro : c'est la série en cours.
  return { current: run, record, recordEnd, reachedOn, blocks }
}

/** Verdict d'un jour pour une habitude : Nickel / Fait = réussi. */
export function habitJudge(habit: Habit, checkins: CheckinIndex): (day: DayKey) => DayVerdict {
  return (day) => {
    if (!isHabitActiveOn(habit, day)) return 'skip'
    const c = checkins.get(checkinKey(habit.playerId, habit.id, day))
    if (!c) return 'empty'
    return isSuccess(c.value) ? 'ok' : 'fail'
  }
}

/** Verdict d'un jour pour le check-in complet d'un joueur (toutes ses habitudes du jour remplies). */
export function checkinJudge(playerId: PlayerId, habits: Habit[], checkins: CheckinIndex): (day: DayKey) => DayVerdict {
  return (day) => {
    const list = activeHabits(habits, playerId, day)
    if (list.length === 0) return 'skip'
    const filled = list.filter((h) => checkins.has(checkinKey(playerId, h.id, day))).length
    if (filled === 0) return 'empty'
    return filled === list.length ? 'ok' : 'pending'
  }
}

/**
 * Séries d'une habitude. Un jour pas encore rempli AUJOURD'HUI ne casse pas la
 * série en cours (on a jusqu'à minuit) ; un jour passé non rempli la casse.
 */
export function habitStreak(habit: Habit, checkins: CheckinIndex, today: DayKey): StreakInfo {
  const { current, record, recordEnd } = scanStreak(habit.activeFrom, today, habitJudge(habit, checkins))
  return { current, record, recordEnd }
}

/**
 * Séries de check-in complet (toutes les habitudes du jour remplies).
 * Aujourd'hui rempli à moitié ne casse pas la série ; un jour passé incomplet, si.
 */
export function checkinStreak(playerId: PlayerId, habits: Habit[], checkins: CheckinIndex, from: DayKey, today: DayKey): StreakInfo {
  const { current, record, recordEnd } = scanStreak(from, today, checkinJudge(playerId, habits, checkins))
  return { current, record, recordEnd }
}
