/**
 * Tout ce qu'il faut pour afficher les résultats d'une manche (terminée ou en cours).
 */
import { useMemo } from 'react'
import { computeBadges, type BadgeState } from '../../core/badges'
import { seasonRecord, type SeasonRecord, type WeekView } from '../../core/season'
import { resultsLine } from '../../core/taunts'
import type { DayKey, Player } from '../../core/types'
import { useDuel } from '../../data/DuelProvider'

export interface WeekResults {
  week: WeekView
  /** Moi à gauche, l'autre à droite (comme sur le Ring). */
  left: Player
  right: Player
  winner: Player | null
  loser: Player | null
  tie: boolean
  gap: number
  stake: string | null
  /** Phrase du gagnant (ou de l'égalité) et phrase taquine du perdant. */
  headline: string
  loserLine: string | null
  /** Bilan des manches après celle-ci. */
  record: SeasonRecord
  /** Badges débloqués pendant cette manche. */
  badges: { player: Player; badge: BadgeState }[]
}

export function useWeekResults(weekStart: DayKey | null): WeekResults | null {
  const { season, snapshot, today, me, other, playerById } = useDuel()
  return useMemo(() => {
    const week = weekStart ? season.weeks.find((w) => w.weekStart === weekStart) : undefined
    if (!week) return null
    const { winnerId, tie, gap } = week.outcome
    const winner = winnerId ? playerById(winnerId) : null
    const loser = winner ? (winner.id === me.id ? other : me) : null
    const stake = week.meta?.stake?.trim() || null
    const seed = week.weekStart
    const headline = tie ? resultsLine('tie', me, other, seed, { stake }) : resultsLine('winner', winner, loser, seed, { gap, stake })
    const loserLine = tie ? null : resultsLine('loser', winner, loser, seed, { gap, stake })

    const ids = snapshot.players.map((p) => p.id)
    const record = seasonRecord(
      ids,
      season.finished.filter((w) => w.weekStart <= week.weekStart),
    )

    const badges: WeekResults['badges'] = []
    for (const player of [me, other]) {
      for (const badge of computeBadges(player.id, snapshot, season, today)) {
        const days = [badge.unlockedOn, ...(badge.tiers?.map((t) => t.unlockedOn) ?? [])]
        if (badge.unlocked && days.some((d) => d !== null && d >= week.weekStart && d <= week.weekEnd)) badges.push({ player, badge })
      }
    }

    return { week, left: me, right: other, winner, loser, tie, gap, stake, headline, loserLine, record, badges }
  }, [weekStart, season, snapshot, today, me, other, playerById])
}
