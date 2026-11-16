/**
 * Calculs de poids en %, pour que le duel reste équitable et que les kilos de
 * l'autre restent privés. Module pur.
 */
import { percentChange } from './scoring'
import type { DayKey, PlayerId, WeighIn } from './types'

export interface RawWeighIn {
  playerId: PlayerId
  day: DayKey
  weightKg: number
}

/**
 * Transforme des pesées en kg en pesées « publiques » (variations en %).
 * `goalAt(playerId, day)` donne le poids objectif en vigueur ce jour-là (ou null).
 * `revealKg(playerId)` dit si on peut garder les kilos (sinon `weightKg` = null).
 */
export function deriveWeighIns(
  raw: RawWeighIn[],
  goalAt: (playerId: PlayerId, day: DayKey) => number | null,
  revealKg: (playerId: PlayerId) => boolean = () => true,
): WeighIn[] {
  const byPlayer = new Map<PlayerId, RawWeighIn[]>()
  for (const r of raw) {
    const list = byPlayer.get(r.playerId) ?? []
    list.push(r)
    byPlayer.set(r.playerId, list)
  }
  const out: WeighIn[] = []
  for (const [playerId, list] of byPlayer) {
    list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    const start = list[0]
    list.forEach((r, i) => {
      const goal = goalAt(playerId, r.day)
      out.push({
        playerId,
        day: r.day,
        weightKg: revealKg(playerId) ? r.weightKg : null,
        changePct: i === 0 ? null : percentChange(list[i - 1].weightKg, r.weightKg),
        fromStartPct: percentChange(start.weightKg, r.weightKg),
        goalDistancePct: goal ? percentChange(goal, r.weightKg) : null,
      })
    })
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.playerId < b.playerId ? -1 : 1))
}

/** Pesées d'un joueur, dans l'ordre chronologique. */
export function weighInsOf(weighIns: WeighIn[], playerId: PlayerId): WeighIn[] {
  return weighIns.filter((w) => w.playerId === playerId).sort((a, b) => (a.day < b.day ? -1 : 1))
}

/** Dernière pesée d'un joueur strictement avant un jour (pour préremplir / comparer). */
export function lastWeighInBefore(weighIns: WeighIn[], playerId: PlayerId, day: DayKey): WeighIn | null {
  let found: WeighIn | null = null
  for (const w of weighIns) {
    if (w.playerId === playerId && w.day < day && (!found || w.day > found.day)) found = w
  }
  return found
}

/** Formate une variation en % à la française : « −0,8 % », « +0,3 % », « 0 % ». */
export function formatPct(pct: number | null | undefined, digits = 1): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return '—'
  const rounded = Number(pct.toFixed(digits))
  if (rounded === 0) return '0 %'
  const sign = rounded > 0 ? '+' : '−'
  return `${sign}${Math.abs(rounded).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`
}

/** Formate un poids : « 72,4 kg ». */
export function formatKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return '— kg'
  return `${kg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
}
