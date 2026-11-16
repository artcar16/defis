/**
 * 🇫🇷 Petits outils de français partagés par toute l'app (module pur) :
 * élisions, pluriels, dates, typographie. Les écrans les importent d'ici au lieu
 * d'avoir chacun leur copie.
 */
import { diffDays, formatDay } from './dates'
import type { DayKey } from './types'

/** Espace insécable (avant ! ? : ; % », après «, entre nombre et unité). */
export const NBSP = ' '

/**
 * Le mot commence-t-il par un son voyelle ? → élision (« d’Arthus », « d’Écrans au lit »).
 * Y compte comme voyelle seulement devant une consonne (« d’Yves », mais « de Yasmine »),
 * et quelques h muets courants (« d’habitude », « d’hier », mais « de huit »).
 */
export function startsWithVowelSound(word: string): boolean {
  const w = word.trim()
  return (
    /^[aeiouàâäéèêëîïôöùûüœæ]/i.test(w) ||
    /^y[^aeiouyàâäéèêëîïôöùûü]/i.test(w) ||
    /^h(?:abit|eur|ier|istoir|uil|uîtr|um|ôt|ydrat|yg)/i.test(w)
  )
}

/** « de Laetitia », « d’Arthus ». */
export function deName(name: string): string {
  return startsWithVowelSound(name) ? `d’${name}` : `de ${name}`
}

/** « que Laetitia », « qu’Arthus ». */
export function queName(name: string): string {
  return startsWithVowelSound(name) ? `qu’${name}` : `que ${name}`
}

/** Le mot seul, accordé : 0 et 1 au singulier (« 1 jour », « 0 point »), sinon au pluriel. */
export function pluralWord(n: number, one: string, many: string = `${one}s`): string {
  return Math.abs(n) >= 2 ? many : one
}

/** « 1 jour », « 3 jours » (espace insécable entre le nombre et le mot). */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n}${NBSP}${pluralWord(n, one, many)}`
}

/** Unité de points seule : « pt » ou « pts ». */
export function ptsUnit(n: number): string {
  return pluralWord(n, 'pt', 'pts')
}

/** « 0 pt », « 1 pt », « 40 pts ». */
export function formatPts(n: number): string {
  return `${n}${NBSP}${ptsUnit(n)}`
}

/** « +1 pt », « +40 pts », « −5 pts » (signe toujours affiché, vrai signe moins). */
export function formatSignedPts(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${formatPts(Math.abs(n))}`
}

/** Première lettre en majuscule. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Première lettre en minuscule (pour insérer un gage dans une phrase : « au programme : vaisselle… »). */
export function lowerFirst(s: string): string {
  // On ne touche pas aux sigles (« TV ») ni aux mots qui commencent par deux majuscules.
  if (/^[A-ZÀ-Ý]{2}/.test(s)) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** Le numéro du jour, avec « 1er » pour le premier du mois. */
export function dayNumber(day: DayKey): string {
  const d = formatDay(day, 'd')
  return d === '1' ? '1er' : d
}

/** « 16 nov. », « 1er nov. » (month = 'MMM') ou « 16 novembre », « 1er novembre » ('MMMM'), insécable. */
export function frDayMonth(day: DayKey, month: 'MMM' | 'MMMM' = 'MMM'): string {
  return `${dayNumber(day)}${NBSP}${formatDay(day, month)}`
}

/**
 * Date complète à la française.
 * - frDate(d) → « dimanche 22 novembre »
 * - frDate(d, { weekday: 'EEE', month: 'MMM' }) → « dim. 1er nov. »
 * - { capitalized: true } → « Dimanche 22 novembre »
 * - { weekday: null } → « 22 novembre »
 */
export function frDate(
  day: DayKey,
  opts: { weekday?: 'EEE' | 'EEEE' | null; month?: 'MMM' | 'MMMM'; capitalized?: boolean } = {},
): string {
  const { weekday = 'EEEE', month = 'MMMM', capitalized = false } = opts
  const text = weekday ? `${formatDay(day, weekday)} ${frDayMonth(day, month)}` : frDayMonth(day, month)
  return capitalized ? capitalize(text) : text
}

/** « du 16 au 22 novembre », « du 26 octobre au 1er novembre ». */
export function weekRangeLabel(start: DayKey, end: DayKey, month: 'MMM' | 'MMMM' = 'MMMM'): string {
  const sameMonth = formatDay(start, 'MM') === formatDay(end, 'MM')
  const from = sameMonth ? dayNumber(start) : frDayMonth(start, month)
  return `du ${from} au ${frDayMonth(end, month)}`
}

/** « aujourd’hui », « demain », « dans 6 jours » (ou « hier », « il y a 3 jours »). */
export function relativeDays(from: DayKey, to: DayKey): string {
  const n = diffDays(from, to)
  if (n === 0) return 'aujourd’hui'
  if (n === 1) return 'demain'
  if (n === -1) return 'hier'
  return n > 0 ? `dans ${plural(n, 'jour')}` : `il y a ${plural(-n, 'jour')}`
}

/** « a », « a et b », « a, b et c ». */
export function joinFr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

/**
 * Typographie française : espace insécable avant ! ? ; : % » et après «, apostrophe
 * courbe. N'ajoute rien aux URL ni aux heures (« 21:30 ») ni aux émoticônes « :) ».
 */
export function typo(s: string): string {
  return s
    .replace(/(\S)'(\S)/g, '$1’$2')
    .replace(/«[ \u00a0]?/g, `«${NBSP}`)
    .replace(/[ \u00a0]?»/g, `${NBSP}»`)
    .replace(/ ([!?;%])/g, `${NBSP}$1`)
    .replace(/ :(?=\s|$)/g, `${NBSP}:`)
}
