/**
 * Dates au fuseau de Paris. Les jours sont manipulés comme des clés 'YYYY-MM-DD'
 * (DayKey) : l'arithmétique se fait en UTC pur, donc sans piège d'heure d'été.
 */
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { RULES } from '../config/rules'
import type { DayKey } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function parseUtc(day: DayKey): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toKey(date: Date): DayKey {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Le jour (à Paris) d'un instant donné. */
export function dayKeyAt(instant: Date, timezone: string = RULES.timezone): DayKey {
  return format(new TZDate(instant.getTime(), timezone), 'yyyy-MM-dd')
}

/** L'heure (0-23) à Paris d'un instant donné. */
export function hourAt(instant: Date, timezone: string = RULES.timezone): number {
  return new TZDate(instant.getTime(), timezone).getHours()
}

/**
 * Le jour `day`, à l'heure (à Paris) de l'instant donné. Sert à la démo pour « voyager »
 * d'un jour à l'autre en gardant l'heure réelle, sans décalage aux changements d'heure.
 */
export function atSameTimeOn(day: DayKey, instant: Date, timezone: string = RULES.timezone): Date {
  const t = new TZDate(instant.getTime(), timezone)
  const [y, m, d] = day.split('-').map(Number)
  return new Date(new TZDate(y, m - 1, d, t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds(), timezone).getTime())
}

export function addDays(day: DayKey, n: number): DayKey {
  return toKey(new Date(parseUtc(day).getTime() + n * DAY_MS))
}

/** Nombre de jours de `from` à `to` (positif si `to` est après). */
export function diffDays(from: DayKey, to: DayKey): number {
  return Math.round((parseUtc(to).getTime() - parseUtc(from).getTime()) / DAY_MS)
}

/** 1 = lundi … 7 = dimanche. */
export function isoDayOf(day: DayKey): number {
  const js = parseUtc(day).getUTCDay() // 0 = dimanche
  return js === 0 ? 7 : js
}

/** Lundi de la manche qui contient ce jour. */
export function weekStartOf(day: DayKey): DayKey {
  return addDays(day, 1 - isoDayOf(day))
}

/** Dimanche de la manche qui commence ce lundi. */
export function weekEndOf(weekStart: DayKey): DayKey {
  return addDays(weekStart, RULES.week.days - 1)
}

/** Les 7 jours d'une manche, du lundi au dimanche. */
export function weekDays(weekStart: DayKey): DayKey[] {
  return Array.from({ length: RULES.week.days }, (_, i) => addDays(weekStart, i))
}

/** Lundi suivant (strictement après ce jour). */
export function nextMonday(day: DayKey): DayKey {
  return addDays(weekStartOf(day), 7)
}

/** Tous les jours de `from` à `to` inclus. */
export function daysRange(from: DayKey, to: DayKey): DayKey[] {
  const n = diffDays(from, to)
  if (n < 0) return []
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i))
}

export function isSameWeek(a: DayKey, b: DayKey): boolean {
  return weekStartOf(a) === weekStartOf(b)
}

/** Formatage en français, ex. formatDay(d, 'EEEE d MMMM') → « lundi 16 novembre ». */
export function formatDay(day: DayKey, pattern: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return format(new Date(y, m - 1, d, 12), pattern, { locale: fr })
}

export const ISO_DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
export const ISO_DAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

/** Nom du jour pour un isoDay (1 = lundi). */
export function isoDayName(isoDay: number): string {
  return ISO_DAY_NAMES[(isoDay - 1 + 7) % 7]
}
