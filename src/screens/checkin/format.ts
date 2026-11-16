/**
 * Ce qui est propre au check-in. Le reste est partagé :
 * français (dates, pluriels, points, élisions) dans core/fr.ts, couleurs dans ui/color.ts.
 */
import type { HabitKind } from '../../core/types'

export const KIND_LABELS: Record<HabitKind, string> = {
  avoid: 'à éviter',
  do: 'à faire',
}

/** Version « ombre » d'une couleur (bord inférieur des gros boutons de réponse). */
export function shadeOf(color: string, pct = 72): string {
  return `color-mix(in oklab, ${color} ${pct}%, black)`
}
