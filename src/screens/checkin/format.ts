/**
 * Petits formatages en français pour le check-in (dates, pluriels, couleurs).
 */
import { formatDay } from '../../core/dates'
import type { DayKey, HabitKind } from '../../core/types'

/** « 1 habitude », « 3 habitudes » (0 et 1 au singulier, comme en français). */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${Math.abs(n) >= 2 ? pluralForm : singular}`
}

/** « Mardi 17 novembre », « Dimanche 1er novembre ». */
export function longDate(day: DayKey): string {
  const text = `${formatDay(day, 'EEEE')} ${dayMonth(day)}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** « 23 novembre », « 1er décembre ». */
export function dayMonth(day: DayKey): string {
  const d = formatDay(day, 'd')
  return `${d === '1' ? '1er' : d} ${formatDay(day, 'MMMM')}`
}

/** « dimanche », « mercredi ». */
export function weekdayName(day: DayKey): string {
  return formatDay(day, 'EEEE')
}

/** « +10 pts », « +5 pts », « 0 pt ». */
export function pointsLabel(points: number): string {
  return points === 0 ? '0 pt' : `+${points} pts`
}

export const KIND_LABELS: Record<HabitKind, string> = {
  avoid: 'à éviter',
  do: 'à faire',
}

/** Teinte douce d'une couleur sur le fond carte (fonctionne en clair comme en sombre). */
export function tint(color: string, pct: number, base = 'var(--color-surface)'): string {
  return `color-mix(in oklab, ${color} ${pct}%, ${base})`
}

/** Texte lisible dans la couleur donnée (mélangée à l'encre du thème). */
export function inkOf(color: string, pct = 72): string {
  return `color-mix(in oklab, ${color} ${pct}%, var(--color-ink))`
}

/** Version « ombre » d'une couleur (bord inférieur des boutons chunky). */
export function shadeOf(color: string, pct = 72): string {
  return `color-mix(in oklab, ${color} ${pct}%, black)`
}

/** Lit un jeton de couleur du thème (pour canvas-confetti, qui veut des couleurs hex). */
export function themeColor(token: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim()
    return v || fallback
  } catch {
    return fallback
  }
}
