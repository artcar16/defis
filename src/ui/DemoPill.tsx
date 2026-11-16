/**
 * 🧪 Pastille « Maquette · données inventées » : en haut de chaque écran (et de la connexion)
 * quand l'app tourne en maquette, pour qu'on ne la prenne jamais pour la vraie partie.
 * Dans le flux de la page (pas par-dessus le contenu), sous l'encoche.
 */
import { tint } from './color'

/** Le libellé de la pastille, repris tel quel sur les toasts de la maquette. */
export const DEMO_LABEL = 'Maquette · données inventées'

export function DemoPill({ className = '' }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`}>
      <p
        role="note"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-[13px] leading-tight font-semibold text-ink"
        style={{
          background: tint('var(--color-gold)', 22),
          boxShadow: `inset 0 0 0 1.5px ${tint('var(--color-gold)', 60, 'transparent')}`,
        }}
      >
        <span aria-hidden="true">🧪</span>
        {DEMO_LABEL}
      </p>
    </div>
  )
}
