/**
 * Petites briques de l'écran Stats : apparition en cascade, sélecteur segmenté.
 */
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import type { Player } from '../../core/types'
import { springy } from '../../ui/kit'

/** Apparition en cascade des blocs (désactivée si « réduire les animations »). */
export function Reveal({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion() ?? false
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.07 * index }}
    >
      {children}
    </motion.div>
  )
}

export interface SegmentOption {
  id: string
  label: string
  player: Pick<Player, 'emoji' | 'color' | 'name'>
}

/** Sélecteur segmenté « Moi / Laetitia » : la pastille glisse et prend la couleur du joueur. */
export function PlayerToggle({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption[]
  value: string
  onChange: (id: string) => void
  /** Nom accessible du groupe. */
  label: string
}) {
  const reduced = useReducedMotion() ?? false
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-sunken p-1.5">
      {options.map((o) => {
        const active = o.id === value
        return (
          <motion.button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            whileTap={{ scale: 0.94 }}
            transition={springy}
            className={`relative flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-3 font-display text-[17px] font-semibold transition-colors ${
              active ? 'text-white' : 'text-ink-soft'
            }`}
          >
            {active && (
              <motion.span
                layoutId="stats-player-toggle"
                className="absolute inset-0 rounded-full"
                style={{
                  background: o.player.color,
                  boxShadow: `0 4px 0 color-mix(in oklab, ${o.player.color} 68%, black), 0 8px 16px -8px ${o.player.color}`,
                }}
                transition={reduced ? { duration: 0 } : springy}
              />
            )}
            <span className="relative text-[22px] leading-none" aria-hidden="true">
              {o.player.emoji}
            </span>
            <span className="relative truncate">{o.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
