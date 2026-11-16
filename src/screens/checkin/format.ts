/**
 * Ce qui est propre au check-in. Le reste est partagé :
 * français (dates, pluriels, points, élisions) dans core/fr.ts, couleurs dans ui/color.ts.
 */
import { NBSP } from '../../core/fr'
import type { HabitKind } from '../../core/types'

/** « tout ou rien » ne se coupe pas ; si la ligne est trop courte, la coupure se fait après le « · ». */
export const STRICT_TAG = `tout${NBSP}ou${NBSP}rien`

export const KIND_LABELS: Record<HabitKind, string> = {
  avoid: 'à éviter',
  avoid_strict: `à${NBSP}éviter${NBSP}· ${STRICT_TAG}`,
  do: 'à faire',
}

/** Version « ombre » d'une couleur (bord inférieur des gros boutons de réponse). */
export function shadeOf(color: string, pct = 72): string {
  return `color-mix(in oklab, ${color} ${pct}%, black)`
}
