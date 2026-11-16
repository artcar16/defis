/**
 * 🏷️ Version de l'app : date du build et commit, posés par vite.config.ts (__BUILD_INFO__).
 * Sert à vérifier qu'un redéploiement sur Vercel a bien eu lieu : la date change.
 */
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { RULES } from '../config/rules'
import { dayKeyAt } from '../core/dates'
import { frDate, NBSP } from '../core/fr'

export interface BuildInfo {
  /** Date du build, ISO. */
  readonly date: string
  /** Commit déployé (7 caractères), ou null hors Vercel. */
  readonly commit: string | null
}

/** La version de ce build (null si la constante n'a pas été définie). */
export const BUILD_INFO: BuildInfo | null = typeof __BUILD_INFO__ === 'undefined' ? null : __BUILD_INFO__

/**
 * « 16 novembre à 14:32 · a1b2c3d » (heure de Paris ; l'année seulement si ce n'est pas
 * celle de `now`). null si la date est illisible.
 */
export function buildLabel(info: BuildInfo, now: Date = new Date()): string | null {
  const at = new Date(info.date)
  if (Number.isNaN(at.getTime())) return null
  const day = dayKeyAt(at)
  const sameYear = day.slice(0, 4) === dayKeyAt(now).slice(0, 4)
  const date = `${frDate(day, { weekday: null })}${sameYear ? '' : ` ${day.slice(0, 4)}`}`
  const time = format(new TZDate(at.getTime(), RULES.timezone), 'HH:mm')
  return `${date} à${NBSP}${time}${info.commit ? ` · ${info.commit}` : ''}`
}

/** « Version du 16 novembre à 14:32 · a1b2c3d », ou null si inconnue. */
export function versionText(info: BuildInfo | null = BUILD_INFO, now?: Date): string | null {
  const label = info ? buildLabel(info, now) : null
  return label ? `Version du ${label}` : null
}
