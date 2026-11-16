/**
 * Petits utilitaires de l'écran Stats : couleurs dérivées des joueurs, dates courtes, pluriels.
 * Les couleurs passent toujours par les jetons du thème (clair / sombre automatique).
 */
import { formatDay } from '../../core/dates'
import type { DayKey } from '../../core/types'

/** Teinte légère d'une couleur sur la surface (fonds de pastilles, cartes). */
export function tint(color: string, pct: number): string {
  return `color-mix(in oklab, ${color} ${pct}%, var(--color-surface))`
}

/** Couleur de joueur mélangée à l'encre : lisible en texte, en clair comme en sombre. */
export function deep(color: string, pct = 75): string {
  return `color-mix(in oklab, ${color} ${pct}%, var(--color-ink))`
}

/** « 9 nov. », « 1er déc. » */
export function shortDay(day: DayKey): string {
  return day.endsWith('-01') ? `1er ${formatDay(day, 'MMM')}` : formatDay(day, 'd MMM')
}

/** « mar. 10 nov. », « dim. 1er nov. » */
export function mediumDay(day: DayKey): string {
  return `${formatDay(day, 'EEE')} ${shortDay(day)}`
}

/** « 3 manches », « 1 manche » */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n > 1 ? many : one}`
}

/** Pourcentage d'axe à la française : « 0 % », « −1 % », « −0,5 % ». */
export function axisPct(v: number): string {
  const rounded = Math.round(v * 10) / 10
  if (rounded === 0) return '0 %'
  const abs = Math.abs(rounded)
  const txt = Number.isInteger(abs) ? String(abs) : abs.toFixed(1).replace('.', ',')
  return `${rounded < 0 ? '−' : '+'}${txt} %`
}
