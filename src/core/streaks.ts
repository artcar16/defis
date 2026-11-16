/**
 * Séries 🔥, records et calendriers par habitude. Module pur.
 *
 * TODO(agent core) : implémentation complète + tests (src/core/streaks.test.ts).
 */
import { addDays, daysRange } from './dates'
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
 * Séries d'une habitude. Un jour pas encore rempli AUJOURD'HUI ne casse pas la
 * série en cours (on a jusqu'à minuit) ; un jour passé non rempli la casse.
 */
export function habitStreak(habit: Habit, checkins: CheckinIndex, today: DayKey): StreakInfo {
  return successStreak(
    habit.activeFrom,
    today,
    (day) => {
      if (!isHabitActiveOn(habit, day)) return 'skip'
      const c = checkins.get(checkinKey(habit.playerId, habit.id, day))
      if (!c) return 'empty'
      return isSuccess(c.value) ? 'ok' : 'fail'
    },
  )
}

/** Séries de check-in complet (toutes les habitudes du jour remplies). */
export function checkinStreak(playerId: PlayerId, habits: Habit[], checkins: CheckinIndex, from: DayKey, today: DayKey): StreakInfo {
  return successStreak(from, today, (day) => {
    const list = activeHabits(habits, playerId, day)
    if (list.length === 0) return 'skip'
    const filled = list.filter((h) => checkins.has(checkinKey(playerId, h.id, day))).length
    if (filled === 0) return 'empty'
    return filled === list.length ? 'ok' : 'fail'
  })
}

type DayResult = 'ok' | 'fail' | 'empty' | 'skip'

function successStreak(from: DayKey, today: DayKey, judge: (day: DayKey) => DayResult): StreakInfo {
  let run = 0
  let record = 0
  let recordEnd: DayKey | null = null
  for (const day of daysRange(from, today)) {
    const r = judge(day)
    if (r === 'skip') continue
    if (r === 'ok') {
      run++
      if (run > record) {
        record = run
        recordEnd = day
      }
    } else if (!(r === 'empty' && day === today)) {
      run = 0
    }
  }
  // La série en cours : si aujourd'hui n'est pas encore rempli, elle continue depuis hier.
  let current = 0
  let day = today
  if (judge(today) === 'empty') day = addDays(today, -1)
  for (; day >= from; day = addDays(day, -1)) {
    const r = judge(day)
    if (r === 'skip') continue
    if (r !== 'ok') break
    current++
  }
  return { current, record, recordEnd }
}
