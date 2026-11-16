/**
 * Rayons dorés qui tournent derrière une médaille (cérémonie, fiche détaillée).
 */
import { motion, useReducedMotion } from 'motion/react'

export function Rays({
  size,
  glow,
  strength = 38,
  duration = 28,
}: {
  /** Diamètre en px. */
  size: number
  /** Couleur du halo central (couleur du joueur). */
  glow: string
  /** Intensité des rayons (% de doré). */
  strength?: number
  /** Durée d'un tour, en secondes. */
  duration?: number
}) {
  const reduced = useReducedMotion() ?? false
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2"
      style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle, color-mix(in oklab, ${glow} 42%, transparent), transparent 58%)` }}
      />
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `repeating-conic-gradient(from 0deg, color-mix(in oklab, var(--color-gold) ${strength}%, transparent) 0deg 9deg, transparent 9deg 22.5deg)`,
          maskImage: 'radial-gradient(circle, black 12%, transparent 66%)',
          WebkitMaskImage: 'radial-gradient(circle, black 12%, transparent 66%)',
        }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={{ duration, ease: 'linear', repeat: Infinity }}
      />
    </div>
  )
}
