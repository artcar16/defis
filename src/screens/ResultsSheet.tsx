/** Feuille Résultats de la semaine — à construire. */
import type { DayKey } from '../core/types'
import { Sheet } from '../ui/kit'

export function ResultsSheet({ weekStart, onClose }: { weekStart: DayKey | null; onClose: () => void }) {
  return (
    <Sheet open={weekStart !== null} onClose={onClose} title="🏆 Résultats">
      <p>Bientôt… {weekStart}</p>
    </Sheet>
  )
}
