/**
 * 😈 Choix des phrases taquines selon la situation. Module pur.
 * Les textes eux-mêmes sont dans src/content/phrases.ts (faciles à modifier).
 *
 * TODO(agent core) : implémentation complète + tests (src/core/taunts.test.ts).
 */
import type { DayScore } from './scoring'
import type { SeasonRecord } from './season'
import type { CheckinValue, DayKey, Player } from './types'

export interface StreakHighlight {
  playerId: string
  habitName: string
  emoji: string
  days: number
}

/** Tout ce qu'il faut savoir pour choisir la phrase du Ring. */
export interface RingTauntContext {
  me: Player
  other: Player
  /** Score de la semaine en cours. */
  myTotal: number
  otherTotal: number
  /** Jour de la semaine, 1 = lundi … 7 = dimanche. */
  isoDay: number
  /** Heure à Paris (0-23). */
  hour: number
  daysLeft: number
  myToday: DayScore
  otherToday: DayScore
  /** Meilleure série en cours de chacun (s'il y en a une). */
  myBestStreak: StreakHighlight | null
  otherBestStreak: StreakHighlight | null
  isWeighInDay: boolean
  record: SeasonRecord
  /** Graine pour que la phrase ne change pas à chaque rendu (ex. le jour). */
  seed: DayKey
}

/** Phrase taquine du Ring. */
export function pickRingTaunt(ctx: RingTauntContext): string {
  const gap = Math.abs(ctx.myTotal - ctx.otherTotal)
  if (ctx.myTotal === ctx.otherTotal) return `Égalité parfaite. Ça sent la bagarre 🥊`
  const leader = ctx.myTotal > ctx.otherTotal ? ctx.me : ctx.other
  return `${leader.name} mène de ${gap} pts 😏`
}

/** Contexte de la phrase affichée après (ou pendant) le check-in. */
export interface CheckinLineContext {
  player: Player
  day: DayScore
  /** Réponses du jour, par habitude. */
  answers: { habitName: string; emoji: string; badgeKey: string | null; value: CheckinValue | null }[]
  seed: DayKey
}

/** Phrase de réaction au check-in (journée parfaite, craquage, en cours…). */
export function pickCheckinLine(ctx: CheckinLineContext): string {
  if (ctx.day.perfect) return 'Journée parfaite ! 🎉'
  if (!ctx.day.complete) return 'Encore un petit effort, tout se remplit en 15 secondes ⏱️'
  return 'Check-in bouclé ✅'
}

/** Réaction à une pesée. */
export function weighInReaction(changePct: number | null, points: number): { emoji: string; text: string } {
  if (changePct === null) return { emoji: '📍', text: 'Point de départ enregistré !' }
  if (points >= 100) return { emoji: '🚀', text: 'Plein pot !' }
  if (points > 0) return { emoji: '👍', text: 'Ça descend !' }
  return { emoji: '🤷', text: 'On se rattrape la semaine prochaine.' }
}

/** Phrases de la cérémonie des résultats. */
export function resultsLine(kind: 'winner' | 'loser' | 'tie', winner: Player | null, loser: Player | null, seed: DayKey): string {
  void seed
  if (kind === 'tie') return 'Égalité ! Gage pour les deux 🤝'
  if (kind === 'winner') return `${winner?.name ?? ''} remporte la manche 👑`
  return `${loser?.name ?? ''}, c’est l’heure du gage 😭`
}
