/**
 * Les paliers de 🪶 Plume (−2 % / −5 % / −10 %) : dorés une fois atteints.
 */
import { motion, useReducedMotion } from 'motion/react'
import type { BadgeState } from '../../core/badges'
import { NBSP } from '../../core/fr'

export function TierChips({ badge }: { badge: BadgeState }) {
  const reduced = useReducedMotion() ?? false
  const tiers = badge.tiers ?? []
  return (
    <ul className="flex flex-wrap justify-center gap-1" aria-label="Paliers">
      {tiers.map((t, i) => {
        const done = t.unlockedOn !== null
        return (
          <motion.li
            key={t.label}
            initial={reduced ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.2 + i * 0.07 }}
            className="score-num rounded-full px-2 py-1 text-[13px] leading-none whitespace-nowrap"
            style={
              done
                ? {
                    background: 'linear-gradient(180deg, color-mix(in oklab, var(--color-gold) 55%, white), var(--color-gold))',
                    color: 'color-mix(in oklab, var(--color-gold-dark) 45%, black)',
                    boxShadow: '0 2px 0 var(--color-gold-dark)',
                  }
                : { background: 'var(--color-sunken)', color: 'var(--color-muted)', boxShadow: 'inset 0 0 0 1.5px var(--color-line)' }
            }
            aria-label={`${t.label}${NBSP}: ${done ? 'atteint' : 'pas encore'}`}
          >
            {t.label}
          </motion.li>
        )
      })}
    </ul>
  )
}
