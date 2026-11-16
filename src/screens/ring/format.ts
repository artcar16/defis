/**
 * Petits formatages en français pour le Ring (pluriels, dates, activité).
 */
import { formatDay } from '../../core/dates'
import type { DayKey } from '../../core/types'
import type { Activity } from '../../data/source'

/** « 1 jour », « 3 jours » : pluriel français (0 et 1 au singulier). */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${Math.abs(n) >= 2 ? pluralForm : singular}`
}

/** « 4 jours restants », « 1 jour restant ». */
export function daysLeftLabel(n: number): string {
  return n >= 2 ? `${n} jours restants` : `${n} jour restant`
}

/** « 16 novembre », « 1er novembre ». */
export function prettyDay(day: DayKey): string {
  const d = formatDay(day, 'd')
  return `${d === '1' ? '1er' : d} ${formatDay(day, 'MMMM')}`
}

/** « du 16 au 22 novembre », « du 26 octobre au 1er novembre ». */
export function weekRange(start: DayKey, end: DayKey): string {
  const sameMonth = formatDay(start, 'MM') === formatDay(end, 'MM')
  const from = sameMonth ? (formatDay(start, 'd') === '1' ? '1er' : formatDay(start, 'd')) : prettyDay(start)
  return `du ${from} au ${prettyDay(end)}`
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
