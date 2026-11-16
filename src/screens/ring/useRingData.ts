/**
 * Tout ce que le Ring affiche, dérivé de useDuel() : scores, statut du jour,
 * position du nœud de la corde, phrase taquine, rappels.
 * Ne dépend que du snapshot (démo aujourd'hui, Supabase demain).
 */
import { useMemo } from 'react'
import { RULES } from '../../config/rules'
import { addDays, diffDays, isoDayOf } from '../../core/dates'
import {
  activeHabits,
  canEditCheckin,
  dailyScore,
  isWeighInDay,
  type CheckinIndex,
  type DayScore,
} from '../../core/scoring'
import { habitStreak } from '../../core/streaks'
import { pickRingTaunt, type StreakHighlight } from '../../core/taunts'
import type { DayKey, DuelSnapshot, Player, PlayerId, WeighIn } from '../../core/types'
import { useDuel } from '../../data/DuelProvider'

/** Qui mène : 'lead' = devant, 'trail' = derrière, 'even' = égalité. */
export type Standing = 'lead' | 'trail' | 'even'

export interface RingSide {
  player: Player
  /** Score de la manche en cours. */
  total: number
  /** Check-in du jour. */
  today: DayScore
  standing: Standing
  /** Pesée faite aujourd'hui (le jour J). */
  weighInToday: WeighIn | null
}

export interface RingData {
  me: RingSide
  other: RingSide
  /** Écart de points (toujours ≥ 0). */
  gap: number
  /**
   * Position du nœud, de -1 (tout près de moi, à gauche) à +1 (tout près de l'autre, à droite).
   * Relative aux points déjà joués : un écart de 20 pts le lundi pèse plus que le samedi.
   */
  lean: number
  /** Phrase taquine du jour. */
  taunt: string
  /** Aujourd'hui = jour de la pesée. */
  weighInDay: boolean
  /** Hier n'est pas complet mais encore rattrapable. */
  yesterdayToFix: boolean
  /** Propositions de l'autre qui attendent ma réponse. */
  pendingProposals: number
}

/** Amplification de l'écart relatif : 10 % d'écart ≈ 38 % du chemin, 25 % ≈ 76 %. */
const LEAN_GAIN = 4

/** Meilleure série 🔥 en cours d'un joueur (sur ses habitudes actives aujourd'hui). */
function bestStreak(playerId: PlayerId, snapshot: DuelSnapshot, checkins: CheckinIndex, today: DayKey): StreakHighlight | null {
  let best: StreakHighlight | null = null
  for (const habit of activeHabits(snapshot.habits, playerId, today)) {
    const days = habitStreak(habit, checkins, today).current
    if (days > 0 && (!best || days > best.days)) best = { playerId, habitName: habit.name, emoji: habit.emoji, days }
  }
  return best
}

function standingOf(mine: number, theirs: number): Standing {
  return mine > theirs ? 'lead' : mine < theirs ? 'trail' : 'even'
}

export function useRingData(): RingData {
  const { snapshot, season, today, hour, me, other } = useDuel()

  return useMemo(() => {
    const week = season.current
    const checkins = season.data.checkins
    const myTotal = week.scores[me.id]?.total ?? 0
    const otherTotal = week.scores[other.id]?.total ?? 0
    const myToday = dailyScore(me.id, today, snapshot.habits, checkins)
    const otherToday = dailyScore(other.id, today, snapshot.habits, checkins)
    const weighInDay = isWeighInDay(today, snapshot.settings)
    const weighInOf = (id: PlayerId) => snapshot.weighIns.find((w) => w.playerId === id && w.day === today) ?? null

    // Base de comparaison : les points « joués » jusqu'ici (jours passés, ou plus si quelqu'un a déjà rempli aujourd'hui).
    const { days, dailyMax } = RULES.week
    const elapsed = season.notStarted ? 0 : Math.min(days, Math.max(1, diffDays(week.weekStart, today) + 1))
    const basis = Math.max(dailyMax, dailyMax * (elapsed - 1), myTotal, otherTotal)
    const gap = myTotal - otherTotal
    const lean = season.notStarted ? 0 : -Math.tanh((gap / basis) * LEAN_GAIN)

    const taunt = pickRingTaunt({
      me,
      other,
      myTotal,
      otherTotal,
      isoDay: isoDayOf(today),
      hour,
      daysLeft: week.daysLeft,
      myToday,
      otherToday,
      myBestStreak: bestStreak(me.id, snapshot, checkins, today),
      otherBestStreak: bestStreak(other.id, snapshot, checkins, today),
      isWeighInDay: weighInDay,
      record: season.record,
      seed: today,
      notStarted: season.notStarted,
      myWeighInDone: weighInOf(me.id) !== null,
    })

    const yesterday = addDays(today, -1)
    const yesterdayToFix =
      canEditCheckin(yesterday, today, snapshot.settings) && !dailyScore(me.id, yesterday, snapshot.habits, checkins).complete

    return {
      me: { player: me, total: myTotal, today: myToday, standing: standingOf(myTotal, otherTotal), weighInToday: weighInOf(me.id) },
      other: {
        player: other,
        total: otherTotal,
        today: otherToday,
        standing: standingOf(otherTotal, myTotal),
        weighInToday: weighInOf(other.id),
      },
      gap: Math.abs(gap),
      lean,
      taunt,
      weighInDay,
      yesterdayToFix,
      pendingProposals: snapshot.proposals.filter((p) => p.status === 'pending' && p.authorId === other.id).length,
    }
  }, [snapshot, season, today, hour, me, other])
}
