/**
 * Tout ce que l'écran de check-in affiche, dérivé de useDuel() :
 * habitudes du jour choisi, réponses, score du jour, phrase de réaction,
 * fenêtre « Hier », pesée de la semaine, habitudes à venir.
 *
 * Les réponses sont « optimistes » : un tap s'affiche tout de suite, avant même
 * que la source (démo aujourd'hui, Supabase demain) ait confirmé l'écriture.
 * En cas d'erreur, on revient à la valeur enregistrée et on renvoie le message.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { addDays, nextMonday, weekStartOf } from '../../core/dates'
import {
  activeHabits,
  canEditCheckin,
  checkinKey,
  dailyScore,
  maxPointsFor,
  pointsFor,
  weighInDateOfWeek,
  weighInOfWeek,
  type CheckinIndex,
  type DayScore,
} from '../../core/scoring'
import { pickCheckinLine } from '../../core/taunts'
import type { CheckinValue, DayKey, GameSettings, Habit, WeighIn } from '../../core/types'
import { useDuel } from '../../data/DuelProvider'
import type { CheckinDay } from '../../ui/nav'
import { errorText } from '../../ui/format'

/** Jour affiché par le check-in (même type que celui demandé par la navigation). */
export type DayChoice = CheckinDay

export interface HabitRow {
  habit: Habit
  value: CheckinValue | null
  /** Points obtenus pour cette habitude (0 si pas remplie). */
  points: number
  max: number
  /** Dernière manche de cette habitude (désactivée à partir de lundi prochain). */
  lastWeek: boolean
}

export interface WeighInInfo {
  /** Date de la pesée de la manche en cours. */
  date: DayKey
  isToday: boolean
  /** Le jour de la pesée est passé (cette manche). */
  past: boolean
  /** Ma pesée de la manche, si elle est faite. */
  mine: WeighIn | null
}

export interface CheckinView {
  today: DayKey
  /** Jour affiché (aujourd'hui ou hier). */
  day: DayKey
  choice: DayChoice
  /** Le jour affiché est modifiable. */
  editable: boolean
  rows: HabitRow[]
  score: DayScore
  /** Mon score d'aujourd'hui (même quand on regarde hier). */
  todayScore: DayScore
  /** Phrase de réaction (pickCheckinLine). */
  line: string
  yesterday: {
    day: DayKey
    editable: boolean
    /** Pourquoi « Hier » est verrouillé (null s'il est modifiable). */
    lockReason: string | null
    /** Habitudes encore vides hier (0 si verrouillé). */
    missing: number
  }
  /** Check-in de l'adversaire pour le jour affiché. */
  otherScore: DayScore
  /** Mes habitudes qui commencent plus tard (lundi prochain). */
  upcoming: Habit[]
  weighIn: WeighInInfo
  /** Le duel n'a pas encore commencé : rien n'est modifiable. */
  notStarted: boolean
}

/** Pourquoi on ne peut pas remplir ce jour-là (null s'il est modifiable). */
export function lockReasonFor(day: DayKey, today: DayKey, settings: GameSettings): string | null {
  if (canEditCheckin(day, today, settings)) return null
  // Comme canEditCheckin et buildSeason : le duel commence le lundi de la semaine de seasonStart.
  if (day < weekStartOf(settings.seasonStart)) return 'Le duel n’avait pas encore commencé hier 😉'
  if (weekStartOf(day) !== weekStartOf(today)) return 'La manche de la semaine dernière est close 🔒'
  return 'Trop tard pour ce jour-là 🔒'
}

interface Pending {
  value: CheckinValue | null
  seq: number
}

/** Message si la source rejette sans message lisible. */
const SAVE_ERROR = 'Oups, ça n’a pas été enregistré 😕 Réessaie\u00a0!'

export function useCheckin(requested: DayChoice, onError: (message: string) => void) {
  const { snapshot, season, today, me, other, source } = useDuel()
  const settings = snapshot.settings

  // Réponses en cours d'envoi, par `${day}|${habitId}`.
  const [pending, setPending] = useState<Record<string, Pending>>({})
  const seq = useRef(0)

  const yesterdayDay = addDays(today, -1)
  const yesterdayLock = lockReasonFor(yesterdayDay, today, settings)
  // Si « Hier » n'est plus modifiable (ex. on vient de passer à lundi), on revient à aujourd'hui.
  const choice: DayChoice = requested === 'yesterday' && yesterdayLock ? 'today' : requested
  const day = choice === 'today' ? today : yesterdayDay

  // Index des check-ins + réponses optimistes.
  const checkins: CheckinIndex = useMemo(() => {
    const base = season.data.checkins
    const entries = Object.entries(pending)
    if (entries.length === 0) return base
    const merged: CheckinIndex = new Map(base)
    for (const [k, p] of entries) {
      const [d, habitId] = k.split('|')
      const key = checkinKey(me.id, habitId, d)
      if (p.value === null) merged.delete(key)
      else merged.set(key, { playerId: me.id, habitId, day: d, value: p.value, updatedAt: new Date(0).toISOString() })
    }
    return merged
  }, [season.data.checkins, pending, me.id])

  const view: CheckinView = useMemo(() => {
    const habits = snapshot.habits
    const nextMon = nextMonday(day)
    const rows: HabitRow[] = activeHabits(habits, me.id, day).map((habit) => {
      const value = checkins.get(checkinKey(me.id, habit.id, day))?.value ?? null
      return {
        habit,
        value,
        points: pointsFor(habit.kind, value),
        max: maxPointsFor(habit.kind),
        lastWeek: habit.activeUntil !== null && habit.activeUntil <= nextMon,
      }
    })
    const score = dailyScore(me.id, day, habits, checkins)
    const line = pickCheckinLine({
      player: me,
      day: score,
      answers: rows.map((r) => ({ habitName: r.habit.name, emoji: r.habit.emoji, badgeKey: r.habit.badgeKey, value: r.value })),
      seed: day,
      // En rattrapage d'hier, des phrases au passé (pas de « revanche demain »).
      isToday: day === today,
    })

    const yesterdayScore = dailyScore(me.id, yesterdayDay, habits, checkins)
    const weekStart = weekStartOf(today)
    const weighDate = weighInDateOfWeek(weekStart, settings)

    return {
      today,
      day,
      choice,
      editable: canEditCheckin(day, today, settings),
      rows,
      score,
      todayScore: day === today ? score : dailyScore(me.id, today, habits, checkins),
      line,
      yesterday: {
        day: yesterdayDay,
        editable: yesterdayLock === null,
        lockReason: yesterdayLock,
        missing: yesterdayLock === null ? yesterdayScore.total - yesterdayScore.filled : 0,
      },
      otherScore: dailyScore(other.id, day, habits, season.data.checkins),
      upcoming: habits
        .filter((h) => h.playerId === me.id && h.activeFrom > today && (h.activeUntil === null || h.activeUntil > h.activeFrom))
        .sort((a, b) => a.activeFrom.localeCompare(b.activeFrom) || a.sortOrder - b.sortOrder),
      weighIn: {
        date: weighDate,
        isToday: weighDate === today,
        past: weighDate < today,
        mine: weighInOfWeek(snapshot.weighIns, me.id, weekStart),
      },
      notStarted: today < weekStartOf(settings.seasonStart),
    }
  }, [snapshot, season.data.checkins, checkins, settings, today, day, choice, yesterdayDay, yesterdayLock, me, other])

  /** Enregistre une réponse (un tap = enregistré, pas de bouton « valider »). */
  const answer = useCallback(
    async (habitId: string, value: CheckinValue | null) => {
      const k = `${day}|${habitId}`
      const mySeq = ++seq.current
      setPending((prev) => ({ ...prev, [k]: { value, seq: mySeq } }))
      const settle = () =>
        setPending((prev) => {
          if (prev[k]?.seq !== mySeq) return prev
          const next = { ...prev }
          delete next[k]
          return next
        })
      try {
        await source.setCheckin(day, habitId, value)
        settle()
      } catch (e) {
        settle()
        onError(errorText(e, SAVE_ERROR))
      }
    },
    [day, source, onError],
  )

  return { view, answer }
}
