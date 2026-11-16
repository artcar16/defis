/**
 * Petits formatages en français partagés par la pesée et les résultats.
 */
import { diffDays, formatDay } from '../../core/dates'
import type { DayKey } from '../../core/types'

/** « 22 novembre », « 1er novembre ». */
export function prettyDay(day: DayKey): string {
  const d = formatDay(day, 'd')
  return `${d === '1' ? '1er' : d} ${formatDay(day, 'MMMM')}`
}

/** « dimanche 22 novembre ». */
export function longDay(day: DayKey): string {
  return `${formatDay(day, 'EEEE')} ${prettyDay(day)}`
}

/** « dim. 15 nov. ». */
export function shortDay(day: DayKey): string {
  return formatDay(day, 'EEE d MMM')
}

/** « du 9 au 15 novembre », « du 26 octobre au 1er novembre ». */
export function weekRange(start: DayKey, end: DayKey): string {
  const sameMonth = formatDay(start, 'MM') === formatDay(end, 'MM')
  const d = formatDay(start, 'd')
  const from = sameMonth ? (d === '1' ? '1er' : d) : prettyDay(start)
  return `du ${from} au ${prettyDay(end)}`
}

/** « aujourd'hui », « demain », « dans 6 jours ». */
export function inDays(from: DayKey, to: DayKey): string {
  const n = diffDays(from, to)
  if (n <= 0) return 'aujourd’hui'
  if (n === 1) return 'demain'
  return `dans ${n} jours`
}

/** « de Laetitia », « d’Arthus » (élision devant une voyelle). */
export function deName(name: string): string {
  return /^[aeiouyàâäéèêëîïôöùûü]/i.test(name) ? `d’${name}` : `de ${name}`
}

/** Première lettre en majuscule (« Dimanche 22 novembre »). */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Valeur concrète d'un jeton de couleur du thème (canvas-confetti a besoin de vraies
 * couleurs, pas de var(--…)). Ex. tokenColor('--color-gold', '#ffc23d').
 */
export function tokenColor(token: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return v || fallback
}

/** Couleur d'un joueur assombrie vers l'encre (texte lisible en clair comme en sombre). */
export function deep(color: string, pct = 82): string {
  return `color-mix(in oklab, ${color} ${pct}%, var(--color-ink))`
}

/** Teinte légère d'une couleur sur la surface. */
export function tint(color: string, pct = 16): string {
  return `color-mix(in oklab, ${color} ${pct}%, var(--color-surface))`
}
