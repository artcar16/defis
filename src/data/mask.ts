/**
 * 🙈 Ce que l'autre voit de mes % quand je ne montre pas mes kilos (garantie 3 de source.ts,
 * décision 18). Module pur.
 *
 * Des % exacts suffiraient à recalculer les kilos : il n'y a que quelques poids au dixième
 * de kg (souvent un seul et son double) qui redonnent exactement les mêmes nombres. L'autre
 * reçoit donc des % ARRONDIS, choisis pour que l'app en déduise exactement la même chose
 * que mon propre téléphone :
 * - changePct : les mêmes points de pesée (weighInPoints de core/scoring.ts). Entre 0 et
 *   le plein, c'est le centième de % (ces points sont de toute façon visibles dans le score) ;
 *   sinon le dixième.
 * - fromStartPct : au dixième, vers zéro, comme la progression 🪶 de core/badges.ts : mêmes
 *   paliers débloqués (paliers au dixième de %), même progression.
 * - goalDistancePct : l'app ne s'en sert que pour savoir s'il est dans la zone objectif
 *   (isInGoalZone) et ne l'affiche pas : 0 dans la zone, sinon le % entier vers l'extérieur.
 * - goalFromStartPct (objectif du joueur, propositions d'objectif) : au demi-%.
 * Ce qui reste visible par nature, ce sont les points de pesée (le score est public).
 *
 * C'est le miroir EXACT des fonctions duel.mask_* du serveur
 * (supabase/migrations/0001_duel.sql), mêmes opérations float8 dans le même ordre : un test
 * (src/data/supabase/sql.test.ts) compare les deux. La maquette (DemoSource) s'en sert pour
 * montrer la même chose que la vraie base.
 */
import { RULES, type Rules } from '../config/rules'
import type { WeighIn } from '../core/types'

/** Pas de « −0 » (il s'afficherait « −0 % » ailleurs). */
function noNegativeZero(n: number): number {
  return n === 0 ? 0 : n
}

/** Au dixième de % le plus proche (Math.round : les .5 vers le haut). */
export function pctTenth(pct: number): number {
  return noNegativeZero(Math.round(pct * 10) / 10)
}

/** Au demi-% le plus proche : objectif de l'autre en % depuis son départ. */
export function pctHalf(pct: number): number {
  return noNegativeZero(Math.round(pct * 2) / 2)
}

/** fromStartPct de l'autre : au dixième, vers zéro (même calcul que la progression 🪶). */
export function maskFromStart(pct: number): number {
  return noNegativeZero((Math.sign(pct) * Math.floor(Math.abs(pct) * 10 + 1e-6)) / 10)
}

/** changePct de l'autre : arrondi sans changer ses points de pesée. */
export function maskChange(pct: number | null, rules: Rules = RULES): number | null {
  if (pct === null) return null
  const { maxPoints: max, fullPointsLossPct: full } = rules.weighIn
  // Les points de cette variation, calculés comme weighInPoints.
  const points = -pct <= 0 ? 0 : Math.round(Math.min(max, (-pct / full) * max))
  // Perte partielle : le % qui rapporte exactement ces points.
  if (points > 0 && points < max) return -((points * full) / max)
  // Perte pleine : au dixième, jamais moins que le plein.
  if (points >= max) return Math.min(pctTenth(pct), -full)
  // Hausse, stable, ou perte minuscule (0 point) : au dixième.
  return pctTenth(pct)
}

/** goalDistancePct de l'autre : 0 dans la zone objectif, sinon le % entier vers l'extérieur. */
export function maskGoalDistance(pct: number | null, rules: Rules = RULES): number | null {
  if (pct === null) return null
  if (Math.abs(pct) <= rules.weighIn.goalTolerancePct + 1e-9) return 0
  return Math.sign(pct) * Math.ceil(Math.abs(pct))
}

/** Une pesée de l'autre telle qu'il me la montre quand il cache ses kilos. */
export function maskWeighIn(w: WeighIn, rules: Rules = RULES): WeighIn {
  return {
    ...w,
    weightKg: null,
    changePct: maskChange(w.changePct, rules),
    fromStartPct: maskFromStart(w.fromStartPct),
    goalDistancePct: maskGoalDistance(w.goalDistancePct, rules),
  }
}
