/**
 * ⏳ Écran d'attente du premier chargement (session, données) : le titre et un 🥊 qui pulse.
 * Il apparaît en fondu (pas de flash si le chargement est éclair) et, si ça traîne,
 * suggère de vérifier la connexion. Mouvement réduit respecté : le gant reste immobile.
 *
 * Téléphone déjà connecté mais serveur injoignable : on reste ici (pas sur « Qui es-tu ? »,
 * le téléphone n'a rien oublié), avec le problème et un bouton « Réessayer ». La source
 * réessaie aussi toute seule.
 */
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Button } from '../ui/kit'
import { ProblemBanner } from './LoginScreen'

/** Au-delà, on suggère de vérifier la connexion et on propose de réessayer (ms). */
const SLOW_MS = 8000

export function SplashScreen({
  problem = null,
  detail = null,
  onRetry,
}: {
  problem?: string | null
  /** Précision sous le problème (ex. le serveur utilisé quand il ne répond pas). */
  detail?: string | null
  onRetry?: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <motion.div
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),24px)] text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15, duration: 0.3 }}
      role="status"
      aria-live="polite"
    >
      <div className="relative grid size-40 place-items-center">
        {/* Halo aux couleurs des deux joueurs */}
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 200deg, color-mix(in oklab, var(--color-coral) 45%, transparent), color-mix(in oklab, var(--color-electric) 45%, transparent), color-mix(in oklab, var(--color-coral) 45%, transparent))',
            filter: 'blur(18px)',
          }}
          animate={reduced ? undefined : { rotate: 360, scale: [0.9, 1.05, 0.9] }}
          transition={{ rotate: { duration: 6, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } }}
          aria-hidden="true"
        />
        <motion.span
          className="relative text-[88px] leading-none drop-shadow-[0_8px_10px_rgb(43_29_63/0.25)]"
          animate={reduced ? undefined : { scale: [1, 1.16, 1], rotate: [0, -10, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          🥊
        </motion.span>
      </div>

      <h1 className="mt-6 font-display text-[40px] leading-[0.95] font-bold tracking-tight text-ink">Duel des Défauts</h1>
      <p className="mt-3 text-[17px] font-semibold text-ink-soft">On prépare le ring…</p>
      {problem ? (
        <ProblemBanner text={problem} detail={detail} className="mt-5 w-full max-w-[22rem] text-left" />
      ) : (
        slow && (
          <motion.p
            className="mt-4 max-w-[18rem] text-[15px] leading-snug font-semibold text-balance text-ink-soft"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Ça traîne un peu… Vérifie ta connexion 📶
          </motion.p>
        )
      )}
      {onRetry && (problem || slow) && (
        <Button variant="soft" size="md" className="mt-4" onClick={onRetry}>
          🔄 Réessayer
        </Button>
      )}
    </motion.div>
  )
}
