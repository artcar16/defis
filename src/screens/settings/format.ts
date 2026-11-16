/**
 * Textes propres aux réglages (propositions, dates d'effet, saisie des kilos).
 * Aucune dépendance à React. Les outils communs sont ailleurs :
 * français dans core/fr.ts, couleurs dans ui/color.ts, erreurs dans ui/format.ts.
 */
import { RULES } from '../../config/rules'
import { isoDayName } from '../../core/dates'
import { NBSP, capitalize, frDate, typo } from '../../core/fr'
import { isAvoidKind } from '../../core/scoring'
import type { DayKey, Habit, HabitKind, PlayerId, Proposal } from '../../core/types'
import { formatKg, formatPct } from '../../core/weight'

/**
 * « 😇 Nickel · 😬 Un peu · 🙈 Craquage » : chaque morceau reste entier (jamais un emoji seul
 * en bout de ligne) et la coupure se fait juste après un « · ».
 */
function dotted(...parts: string[]): string {
  return parts.map((p) => p.replaceAll(' ', NBSP)).join(`${NBSP}· `)
}

/** Les types d'habitude, dans l'ordre des choix proposés. */
export const KIND_ORDER: HabitKind[] = ['avoid', 'avoid_strict', 'do']
export const KIND_LABEL: Record<HabitKind, string> = { avoid: 'à éviter', avoid_strict: dotted('à éviter', 'tout ou rien'), do: 'à faire' }
export const KIND_EMOJI: Record<HabitKind, string> = { avoid: '🙅', avoid_strict: '🙅', do: '💪' }
/** Les réponses du check-in pour chaque type (ce qui change vraiment d'un type à l'autre). */
export const KIND_SCALE: Record<HabitKind, string> = {
  avoid: dotted('😇 Nickel', '😬 Un peu', '🙈 Craquage'),
  avoid_strict: dotted('😇 Nickel', '🙈 Craquage'),
  do: dotted('💪 Fait', '🛋️ Pas fait'),
}

/** « dès lundi 23 nov. », « dès lundi 1er févr. » (jamais de coupure entre le numéro et le mois). */
export function fromLabel(day: DayKey): string {
  return `dès ${frDate(day, { month: 'MMM' }).replace(/(\d+(?:er)?) /, `$1${NBSP}`)}`
}

/** Encre foncée fixe pour le texte posé sur l'or (l'or ne change pas en mode sombre). */
export const ON_GOLD = 'color-mix(in oklab, var(--color-gold) 22%, black)'

/** « Saisis un poids entre 30 et 250 kg 🙃 » (bornes lues dans RULES). */
export const KG_RANGE_ERROR = `Saisis un poids entre ${RULES.weighIn.minKg} et ${RULES.weighIn.maxKg}${NBSP}kg 🙃`

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

// ─── Propositions ────────────────────────────────────────────────────────────

export interface ProposalText {
  emoji: string
  title: string
  detail?: string
}

export interface DescribeContext {
  meId: PlayerId
  habits: Habit[]
  /** Jour de la pesée en vigueur (1 = lundi … 7 = dimanche). */
  currentWeighDay: number
}

/**
 * Description en français d'une proposition, du point de vue du joueur connecté.
 * Le poids objectif de l'autre n'est jamais donné en kg, seulement en % (décision 18) :
 * dans mon snapshot, son goalKg est d'ailleurs à null.
 */
export function describeProposal(p: Proposal, ctx: DescribeContext): ProposalText {
  const t = describeRaw(p, ctx)
  return { emoji: t.emoji, title: typo(t.title), detail: t.detail === undefined ? undefined : typo(t.detail) }
}

function describeRaw(p: Proposal, ctx: DescribeContext): ProposalText {
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
      const name = h ? `${h.emoji} ${h.name}` : 'une habitude'
      // Entre « à éviter » et « tout ou rien », seul « Un peu » change : on le dit tel quel.
      if (h && h.kind !== pl.habitKind && isAvoidKind(h.kind) && isAvoidKind(pl.habitKind)) {
        const unPeu = `« ${dotted('😬 Un peu')} »`
        return pl.habitKind === 'avoid_strict'
          ? { emoji: '🔄', title: `Fini le ${unPeu} sur ${name}`, detail: `Tout ou rien : ${KIND_SCALE.avoid_strict}` }
          : { emoji: '🔄', title: `Remettre ${unPeu} sur ${name}`, detail: KIND_SCALE.avoid }
      }
      return { emoji: '🔄', title: `Passer ${name} en « ${KIND_LABEL[pl.habitKind]} »`, detail: KIND_SCALE[pl.habitKind] }
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
      // Le drapeau `clear` dit s'il s'agit d'un retrait : goalKg vaut null aussi quand il est masqué.
      if (pl.clear) {
        return { emoji: '🎯', title: mine ? 'Retirer mon objectif de poids' : 'Retirer son objectif de poids' }
      }
      const pct = pl.goalFromStartPct
      if (mine) {
        return {
          emoji: '🎯',
          title: pl.goalKg !== null ? `Mon objectif : ${formatKg(pl.goalKg)}` : 'Mon nouvel objectif de poids',
          detail: pct !== null ? `${formatPct(pct)} depuis mon départ` : undefined,
        }
      }
      return {
        emoji: '🎯',
        title: pct !== null ? `Nouvel objectif : ${formatPct(pct)}` : 'Nouvel objectif de poids',
        detail: pct !== null ? 'depuis sa première pesée' : undefined,
      }
    }
  }
}
