/**
 * Formatages et textes des réglages (propositions, dates, kilos).
 * Aucune dépendance à React : facile à réutiliser une fois branché sur Supabase.
 */
import { RULES } from '../../config/rules'
import { formatDay, isoDayName } from '../../core/dates'
import type { DayKey, Habit, HabitKind, Player, PlayerId, Proposal } from '../../core/types'
import { formatKg, formatPct } from '../../core/weight'

export const KIND_LABEL: Record<HabitKind, string> = { avoid: 'à éviter', do: 'à faire' }
export const KIND_EMOJI: Record<HabitKind, string> = { avoid: '🙅', do: '💪' }
export const KIND_SCALE: Record<HabitKind, string> = {
  avoid: '😇 Nickel · 😬 Un peu · 🙈 Craquage',
  do: '💪 Fait · 🛋️ Pas fait',
}

/** « lundi 23 nov. » */
export function shortDate(day: DayKey): string {
  return formatDay(day, 'EEEE d MMM')
}

/** « dès lundi 23 nov. » */
export function fromLabel(day: DayKey): string {
  return `dès ${shortDate(day)}`
}

/** Teinte douce d'une couleur (fonctionne en clair comme en sombre). */
export function tint(color: string, pct: number, base = 'var(--color-surface)'): string {
  return `color-mix(in oklab, ${color} ${pct}%, ${base})`
}

/** Texte lisible dans une couleur (mélangée à l'encre du thème). */
export function inkOf(color: string, pct = 70): string {
  return `color-mix(in oklab, ${color} ${pct}%, var(--color-ink))`
}

/** Encre foncée fixe pour le texte posé sur l'or (l'or ne change pas en mode sombre). */
export const ON_GOLD = 'color-mix(in oklab, var(--color-gold) 22%, black)'

/** Lit « 78,5 » / « 78.5 » → 78.5 (arrondi au pas de la pesée), ou null si invalide. */
export function parseKg(input: string): number | null {
  const n = Number.parseFloat(input.replace(',', '.').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n)) return null
  const step = RULES.weighIn.stepKg
  const rounded = Math.round(n / step) * step
  if (rounded < RULES.weighIn.minKg || rounded > RULES.weighIn.maxKg) return null
  return Number(rounded.toFixed(1))
}

/** 78.5 → « 78,5 » (pour un champ de saisie). */
export function kgInput(kg: number): string {
  return kg.toFixed(1).replace('.', ',')
}

/** Message d'erreur lisible (les sources lèvent des Error en français). */
export function errorText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  return 'Oups, ça n’a pas marché 😵 Réessaie ?'
}

// ─── Propositions ────────────────────────────────────────────────────────────

export interface ProposalText {
  emoji: string
  title: string
  detail?: string
}

export interface DescribeContext {
  meId: PlayerId
  habits: Habit[]
  playerById: (id: PlayerId) => Player
  /** Jour de la pesée en vigueur (1 = lundi … 7 = dimanche). */
  currentWeighDay: number
}

/**
 * Description en français d'une proposition, du point de vue du joueur connecté.
 * Le poids objectif de l'autre est toujours donné en % (jamais ses kilos).
 */
export function describeProposal(p: Proposal, ctx: DescribeContext): ProposalText {
  const mine = p.authorId === ctx.meId
  const pl = p.payload
  switch (pl.kind) {
    case 'habit_add':
      return {
        emoji: pl.emoji,
        title: `Ajouter ${pl.emoji} ${pl.name} à ${mine ? 'mes' : 'ses'} habitudes`,
        detail: `${KIND_EMOJI[pl.habitKind]} ${capitalize(KIND_LABEL[pl.habitKind])}${pl.hint ? ` · ${pl.hint}` : ''}`,
      }
    case 'habit_disable': {
      const h = ctx.habits.find((x) => x.id === pl.habitId)
      return {
        emoji: '👋',
        title: `Désactiver ${h ? `${h.emoji} ${h.name}` : 'une habitude'}`,
        detail: mine ? 'Elle ne comptera plus dans mon score' : 'Elle ne comptera plus dans son score',
      }
    }
    case 'habit_kind': {
      const h = ctx.habits.find((x) => x.id === pl.habitId)
      return {
        emoji: '🔄',
        title: `Passer ${h ? `${h.emoji} ${h.name}` : 'une habitude'} en « ${KIND_LABEL[pl.habitKind]} »`,
        detail: KIND_SCALE[pl.habitKind],
      }
    }
    case 'weigh_day':
      return {
        emoji: '⚖️',
        title: `Pesée le ${isoDayName(pl.isoDay)}`,
        detail:
          pl.isoDay === ctx.currentWeighDay
            ? 'Pour nous deux'
            : `Au lieu du ${isoDayName(ctx.currentWeighDay)}, pour nous deux`,
      }
    case 'goal_weight': {
      if (pl.goalKg === null && pl.goalFromStartPct === null) {
        return { emoji: '🎯', title: mine ? 'Retirer mon objectif de poids' : 'Retirer son objectif de poids' }
      }
      if (mine) {
        return {
          emoji: '🎯',
          title: `Mon objectif : ${formatKg(pl.goalKg)}`,
          detail: pl.goalFromStartPct !== null ? `${formatPct(pl.goalFromStartPct)} depuis mon départ` : undefined,
        }
      }
      return {
        emoji: '🎯',
        title: pl.goalFromStartPct !== null ? `Nouvel objectif : ${formatPct(pl.goalFromStartPct)}` : 'Nouvel objectif de poids',
        detail: pl.goalFromStartPct !== null ? 'depuis sa première pesée' : undefined,
      }
    }
  }
}

/** « de Laetitia », « d’Arthus » (élision devant une voyelle). */
export function deName(name: string): string {
  return /^[aeiouyàâäéèêëîïôöùûü]/i.test(name) ? `d’${name}` : `de ${name}`
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Propositions en attente du joueur connecté, par type. */
export function myPending(proposals: Proposal[], meId: PlayerId): Proposal[] {
  return proposals.filter((p) => p.status === 'pending' && p.authorId === meId)
}
