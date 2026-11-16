/**
 * Données de la feuille Pesée : mes pesées, la précédente, celle de l'autre,
 * la prochaine date, et l'aperçu des points pendant la saisie.
 */
import { useMemo } from 'react'
import { RULES } from '../../config/rules'
import { nextMonday, weekStartOf } from '../../core/dates'
import { canWeighIn, percentChange, weighInDateOfWeek, weighInPoints } from '../../core/scoring'
import type { DayKey, GameSettings, WeighIn } from '../../core/types'
import { lastWeighInBefore, weighInsOf } from '../../core/weight'
import { useDuel } from '../../data/DuelProvider'

/** Prochaine date de pesée à partir d'aujourd'hui (aujourd'hui si c'est le jour J). */
export function nextWeighInDate(today: DayKey, settings: Pick<GameSettings, 'weighInDays'>): DayKey {
  const thisWeek = weighInDateOfWeek(weekStartOf(today), settings)
  return thisWeek >= today ? thisWeek : weighInDateOfWeek(nextMonday(today), settings)
}

export interface WeighInPreview {
  /** Toute première pesée : elle sert de point de départ (0 pt). */
  first: boolean
  /** Variation en % depuis la pesée précédente (`null` si première). */
  changePct: number | null
  /** Écart en % à l'objectif (`null` sans objectif). */
  goalDistancePct: number | null
  points: number
  /** Variation depuis la toute première pesée (0 si c'est elle). */
  fromStartPct: number
  inGoalZone: boolean
}

/** Ce que rapporterait une pesée de `kg` (mêmes règles que le score de la manche). */
export function previewWeighIn(kg: number, prevKg: number | null, startKg: number | null, goalKg: number | null): WeighInPreview {
  const first = prevKg === null
  const changePct = prevKg === null ? null : percentChange(prevKg, kg)
  const goalDistancePct = goalKg ? percentChange(goalKg, kg) : null
  const points = weighInPoints({ changePct, goalDistancePct })
  const inGoalZone = goalDistancePct !== null && Math.abs(goalDistancePct) <= RULES.weighIn.goalTolerancePct + 1e-9
  return {
    first,
    changePct,
    goalDistancePct,
    points,
    fromStartPct: startKg === null ? 0 : percentChange(startKg, kg),
    inGoalZone,
  }
}

export interface WeighInData {
  today: DayKey
  /** C'est le jour de la pesée : on peut se peser (ou corriger) aujourd'hui. */
  open: boolean
  /** Prochaine pesée (aujourd'hui si `open`). */
  nextDate: DayKey
  /** Mes pesées, dans l'ordre chronologique. */
  mine: WeighIn[]
  /** Ma pesée du jour, si déjà faite. */
  todayWeighIn: WeighIn | null
  /** Ma dernière pesée avant aujourd'hui (la référence de la variation). */
  prev: WeighIn | null
  /** Ma toute première pesée, si elle est avant aujourd'hui. */
  start: WeighIn | null
  /** Dernière pesée de l'autre (kilos masqués s'il ne les montre pas). */
  otherLatest: WeighIn | null
}

export function useWeighInData(): WeighInData {
  const { snapshot, today, me, other } = useDuel()
  return useMemo(() => {
    const mine = weighInsOf(snapshot.weighIns, me.id)
    const theirs = weighInsOf(snapshot.weighIns, other.id)
    return {
      today,
      open: canWeighIn(today, snapshot.settings),
      nextDate: nextWeighInDate(today, snapshot.settings),
      mine,
      todayWeighIn: mine.find((w) => w.day === today) ?? null,
      prev: lastWeighInBefore(snapshot.weighIns, me.id, today),
      start: mine[0] && mine[0].day < today ? mine[0] : null,
      otherLatest: theirs.at(-1) ?? null,
    }
  }, [snapshot.weighIns, snapshot.settings, today, me.id, other.id])
}

/** Bornes et pas du sélecteur, en dixièmes de kg (entiers : pas d'erreurs d'arrondi). */
export const TENTHS = {
  min: Math.round(RULES.weighIn.minKg * 10),
  max: Math.round(RULES.weighIn.maxKg * 10),
  step: Math.max(1, Math.round(RULES.weighIn.stepKg * 10)),
}

export function clampTenths(t: number): number {
  return Math.min(TENTHS.max, Math.max(TENTHS.min, Math.round(t)))
}

/** « 83,4 » (sans unité). */
export function tenthsLabel(t: number): string {
  return (t / 10).toFixed(1).replace('.', ',')
}
