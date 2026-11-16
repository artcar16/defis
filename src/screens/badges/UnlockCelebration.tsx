/**
 * 🎉 Cérémonie « Nouveau badge ! » : plein écran, rayons qui tournent, la médaille
 * qui surgit (0 → 1,2 → 1 en tournant), confettis. Un tap pour continuer
 * (badge suivant s'il y en a plusieurs), puis le badge est marqué « vu ».
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef } from 'react'
import { NBSP, typo } from '../../core/fr'
import type { DayKey, Player } from '../../core/types'
import { deep, themeColor, tint } from '../../ui/color'
import { Button } from '../../ui/kit'
import { burst, celebrate } from '../../ui/confetti'
import { bragLine, unlockedLabel } from './copy'
import { Medal } from './Medal'
import type { UnlockEvent } from './model'
import { Portal, useModalBehavior } from './Overlay'
import { Rays } from './Rays'

/** Temps minimal d'affichage d'un badge avant de pouvoir passer au suivant (ms). */
const MIN_VIEW_MS = 600

export function UnlockCelebration({
  event,
  position,
  total,
  player,
  otherName,
  today,
  onContinue,
}: {
  event: UnlockEvent | null
  /** Rang de ce badge dans la file (1 = premier). */
  position: number
  total: number
  player: Player
  otherName: string
  today: DayKey
  onContinue: (event: UnlockEvent) => void
}) {
  return (
    <Portal>
      <AnimatePresence>
        {event && (
          <Ceremony
            key="ceremony"
            event={event}
            position={position}
            total={total}
            player={player}
            otherName={otherName}
            today={today}
            onContinue={onContinue}
          />
        )}
      </AnimatePresence>
    </Portal>
  )
}

function Ceremony({
  event,
  position,
  total,
  player,
  otherName,
  today,
  onContinue,
}: {
  event: UnlockEvent
  position: number
  total: number
  player: Player
  otherName: string
  today: DayKey
  onContinue: (event: UnlockEvent) => void
}) {
  const reduced = useReducedMotion() ?? false
  const titleId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { badge, tier } = event
  const isTier = tier !== null && event.tierIndex > 0
  // Anti double-tap : on laisse la médaille apparaître avant d'accepter « continuer ».
  const shownAt = useRef(0)
  const next = () => {
    if (performance.now() - shownAt.current < MIN_VIEW_MS) return
    onContinue(event)
  }
  useModalBehavior(true, next)

  // Confettis quand la médaille atteint son pic, à chaque nouveau badge.
  useEffect(() => {
    shownAt.current = performance.now()
    buttonRef.current?.focus({ preventScroll: true })
    // canvas-confetti ne lit pas les variables CSS : on passe les vraies couleurs.
    const gold = themeColor('gold', '#ffc23d')
    const t1 = window.setTimeout(() => {
      burst([player.color, gold, themeColor('nickel', '#22c55e')], { x: 0.5, y: 0.4 })
      // Petite vibration (Android) — seulement après un premier tap, sinon le navigateur refuse.
      try {
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([30, 50, 70])
      } catch {
        // pas de vibreur : tant pis
      }
    }, 420)
    const t2 = window.setTimeout(() => celebrate([player.color, gold]), 700)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [event.key, player.color])

  return (
    <motion.div
      className="fixed inset-0 z-[70] cursor-pointer overflow-x-hidden overflow-y-auto overscroll-contain text-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      onClick={next}
      style={{
        background: `radial-gradient(circle at 50% 42%, ${tint(player.color, 30, 'var(--color-bg)')}, var(--color-bg) 70%)`,
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={event.key}
          // Pleine largeur + overflow caché : les rayons ne débordent pas (pas de défilement parasite).
          className="relative flex min-h-full w-full justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
        >
          <div className="safe-top safe-bottom flex w-full max-w-sm flex-col items-center justify-center px-6">
          <motion.div
            className="font-display text-[15px] font-bold tracking-[0.18em] uppercase"
            style={{ color: deep('var(--color-gold-dark)', 70) }}
            initial={reduced ? false : { y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
          >
            {total > 1 ? `🎉 ${position} / ${total} 🎉` : '🎉 🎉 🎉'}
          </motion.div>
          <motion.h2
            id={titleId}
            className="mt-1 font-display text-[clamp(30px,10vw,40px)] leading-none font-bold text-balance text-ink"
            initial={reduced ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 480, damping: 14, delay: 0.15 }}
          >
            {isTier ? `Nouveau palier${NBSP}!` : `Nouveau badge${NBSP}!`}
          </motion.h2>

          {/* La médaille, sur fond de rayons qui tournent. */}
          <div className="relative my-6 grid size-[200px] place-items-center [@media(max-height:620px)]:my-3">
            <Rays size={560} glow={player.color} strength={46} duration={22} />
            <motion.div
              initial={reduced ? { opacity: 0 } : { scale: 0, rotate: -45 }}
              animate={reduced ? { opacity: 1 } : { scale: [0, 1.2, 1], rotate: [-45, 12, 0] }}
              transition={reduced ? { duration: 0.2 } : { duration: 0.75, times: [0, 0.6, 1], ease: 'easeOut', delay: 0.2 }}
            >
              <motion.div
                animate={reduced ? undefined : { y: [0, -8, 0] }}
                transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity, delay: 1 }}
              >
                <Medal emoji={badge.emoji} state="unlocked" color={player.color} size="xl" />
              </motion.div>
            </motion.div>
          </div>

          <motion.div
            className="flex flex-col items-center gap-1.5"
            initial={reduced ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.55 }}
          >
            <div className="font-display text-[32px] leading-tight font-bold text-ink">
              {badge.name}
              {tier && <span className="score-num"> {tier.label}</span>}
            </div>
            <p className="text-[16px] leading-snug font-semibold text-balance text-ink-soft">
              {tier ? `Palier ${event.tierIndex + 1} sur ${badge.tiers?.length ?? 1}${NBSP}: ${tier.label} depuis le départ` : typo(badge.description)}
            </p>
            <p className="mt-1 font-display text-[19px] leading-snug font-semibold text-balance" style={{ color: deep(player.color, 75) }}>
              {bragLine(badge.id, otherName)}
            </p>
            <p className="text-[14px] font-bold text-muted">{unlockedLabel(event.on, today)}</p>
          </motion.div>

          <motion.div
            className="mt-6 w-full"
            initial={reduced ? false : { y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.8 }}
          >
            <Button
              ref={buttonRef}
              block
              size="lg"
              color={player.color}
              className="focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-gold"
              onClick={(e) => {
                e.stopPropagation()
                next()
              }}
            >
              {position < total ? 'Badge suivant ➜' : `Trop fort${NBSP}! 🎉`}
            </Button>
            <motion.p
              className="mt-3 text-[14px] font-bold text-muted"
              animate={reduced ? undefined : { opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            >
              Touche n’importe où pour continuer
            </motion.p>
          </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
