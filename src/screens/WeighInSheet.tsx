/** Feuille Pesée — à construire. */
import { Sheet } from '../ui/kit'

export function WeighInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="⚖️ Pesée">
      <p>Bientôt…</p>
    </Sheet>
  )
}
