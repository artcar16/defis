/**
 * Petits textes propres au Ring (le reste du français partagé est dans core/fr.ts).
 */
import { diffDays, formatDay } from '../../core/dates'
import { NBSP, pluralWord } from '../../core/fr'
import type { DayKey } from '../../core/types'
import type { Activity } from '../../data/source'

/** « 4 jours restants », « 1 jour restant ». */
export function daysLeftLabel(n: number): string {
  return `${n}${NBSP}${pluralWord(n, 'jour')} ${pluralWord(n, 'restant')}`
}

/** Salut du Ring selon l'heure : « Bonjour, Laetitia 👋 », « Encore debout, Arthus ? 👋 » la nuit. */
export function greetingLine(hour: number, name: string): string {
  if (hour < 5) return `Encore debout, ${name}${NBSP}? 👋`
  const hello = hour < 12 ? 'Bonjour' : hour < 18 ? 'Salut' : 'Bonsoir'
  return `${hello}, ${name} 👋`
}

/**
 * Jusqu'à quand l'enjeu reste modifiable (dernier jour inclus, jusqu'à 23:59), vu d'aujourd'hui :
 * « minuit », « demain soir », « mercredi soir ». Se lit après « jusqu’à » ou « d’ici ».
 */
export function deadlineLabel(lastDay: DayKey, today: DayKey): string {
  const n = diffDays(today, lastDay)
  if (n <= 0) return 'minuit'
  if (n === 1) return `demain${NBSP}soir`
  return `${formatDay(lastDay, 'EEEE')}${NBSP}soir`
}

/** L'emoji qui « sort » de l'avatar de l'adversaire quand il fait quelque chose en direct. */
export function activityEmoji(kind: Activity['kind']): string {
  switch (kind) {
    case 'checkin_done':
    case 'checkin':
      return '✅'
    case 'weighin':
      return '⚖️'
    case 'proposal':
      return '📬'
    case 'proposal_accepted':
      return '🤝'
    case 'proposal_refused':
      return '🙅'
    case 'stake':
      return '🎲'
    case 'gage_paid':
      return '🫡'
    default:
      return '👀'
  }
}
