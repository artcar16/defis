/**
 * Formats propres à la pesée et aux résultats. Le reste (dates, pluriels, élisions,
 * typographie) vient de core/fr.ts, les couleurs de ui/color.ts.
 */
import { RULES } from '../../config/rules'
import { frDate, NBSP } from '../../core/fr'
import type { DayKey } from '../../core/types'
import { deep } from '../../ui/color'

/** « dim. 1er nov. » (« Dim. 1er nov. » avec `capitalized`). */
export function shortDay(day: DayKey, capitalized = false): string {
  return frDate(day, { weekday: 'EEE', month: 'MMM', capitalized })
}

/** Encre « points gagnés » (vert lisible, en clair comme en sombre). */
export const GAIN_INK = deep('var(--color-nickel)', 70)

// ─── Saisie du poids ─────────────────────────────────────────────────────────

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

/** Message d'une saisie hors bornes : « Entre 30 et 250 kg 🙃 ». */
export const KG_RANGE_TEXT = `Entre ${frNum(RULES.weighIn.minKg)} et ${frNum(RULES.weighIn.maxKg)}${NBSP}kg 🙃`

/** Nombre avec virgule décimale (« 0,5 », « 30 »). */
export function frNum(n: number): string {
  return String(n).replace('.', ',')
}

export type WeightInput =
  /** `guessed` : virgule oubliée, « 823 » lu 82,3. */
  | { ok: true; tenths: number; guessed: boolean }
  /** 'empty' : rien de lisible (on garde l'ancienne valeur) ; 'range' : hors bornes. */
  | { ok: false; reason: 'empty' | 'range' }

/**
 * Lit un poids tapé au clavier (« 82,3 », « 82.3 kg »). Hors bornes, on refuse (jamais
 * ramené en silence à 30 ou 250 kg) ; un entier trop grand sans séparateur est lu comme
 * une virgule oubliée si c'est plausible (« 823 » → 82,3 ; « 8234 » → 82,3).
 */
export function parseWeightInput(text: string): WeightInput {
  const cleaned = text.trim().replace(',', '.').replace(/[^\d.]/g, '')
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n)) return { ok: false, reason: 'empty' }
  const inRange = (t: number) => t >= TENTHS.min && t <= TENTHS.max
  const t = Math.round(n * 10)
  if (inRange(t)) return { ok: true, tenths: t, guessed: false }
  if (!cleaned.includes('.') && Number.isInteger(n) && n > RULES.weighIn.maxKg) {
    for (const div of [10, 100]) {
      const g = Math.round((n / div) * 10)
      if (inRange(g)) return { ok: true, tenths: g, guessed: true }
    }
  }
  return { ok: false, reason: 'range' }
}
