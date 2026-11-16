/**
 * Une case de la galerie : médaille, nom, et selon l'état la date de déblocage,
 * la barre de progression ou « Pas concerné·e ».
 */
import { motion, useReducedMotion, type Variants } from 'motion/react'
import type { BadgeState } from '../../core/badges'
import { NBSP } from '../../core/fr'
import type { DayKey, Player } from '../../core/types'
import { tint } from '../../ui/color'
import { springy } from '../../ui/kit'
import { isBinary, isTiered, progressRatio, progressText, unlockedLabel } from './copy'
import { Medal } from './Medal'
import { TierChips } from './TierChips'

export const tileVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 24 } },
}

export function BadgeTile({
  badge,
  player,
  today,
  index,
  onOpen,
}: {
  badge: BadgeState
  player: Player
  today: DayKey
  index: number
  onOpen: () => void
}) {
  const state = !badge.applicable ? 'na' : badge.unlocked ? 'unlocked' : 'locked'
  const tiered = isTiered(badge)

  return (
    <motion.button
      type="button"
      variants={tileVariants}
      whileTap={{ scale: 0.95 }}
      transition={springy}
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`card relative flex flex-col items-center gap-2 overflow-hidden px-3 pt-4 pb-3.5 text-center ${
        state === 'na' ? 'opacity-60' : ''
      }`}
      style={
        state === 'unlocked'
          ? {
              background: `linear-gradient(180deg, ${tint('var(--color-gold)', 20)}, var(--color-surface) 62%)`,
              boxShadow: `var(--shadow-card), inset 0 0 0 2px color-mix(in oklab, var(--color-gold) 45%, transparent)`,
            }
          : state === 'na'
            ? { background: 'transparent', boxShadow: 'inset 0 0 0 2px var(--color-line)' }
            : undefined
      }
    >
      {state === 'unlocked' && <Twinkle delay={(index % 3) * 0.7} />}

      <Medal
        emoji={badge.emoji}
        state={state}
        color={player.color}
        size="md"
        count={tiered ? 0 : badge.count}
        shineDelay={(index % 4) * 0.9}
      />

      <span
        className={`font-display text-[17px] leading-tight font-semibold ${state === 'unlocked' ? 'text-ink' : 'text-ink-soft'}`}
      >
        {badge.name}
        <span className="sr-only">
          {state === 'unlocked' ? `${NBSP}: débloqué${badge.count > 1 && !tiered ? `, obtenu ${badge.count} fois` : ''}` : state === 'locked' ? `${NBSP}: verrouillé` : ''}
        </span>
      </span>

      {state === 'unlocked' && badge.unlockedOn && !tiered && (
        <span className="text-[14px] leading-tight font-bold text-muted">{unlockedLabel(badge.unlockedOn, today)}</span>
      )}

      {tiered && state !== 'na' && <TierChips badge={badge} />}

      {state === 'locked' && <LockedProgress badge={badge} color={player.color} />}

      {state === 'na' && (
        <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[13px] font-bold text-muted">Pas concerné·e</span>
      )}
    </motion.button>
  )
}

/** Petit ✨ qui scintille dans le coin des badges débloqués. */
function Twinkle({ delay }: { delay: number }) {
  const reduced = useReducedMotion() ?? false
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute top-2.5 left-3 text-[18px] leading-none"
      initial={{ opacity: 0 }}
      animate={reduced ? { opacity: 0.8 } : { opacity: [0, 1, 0], scale: [0.4, 1.15, 0.4], rotate: [0, 25, 50] }}
      transition={reduced ? undefined : { duration: 1.8, repeat: Infinity, repeatDelay: 1.6, delay: 0.8 + delay }}
    >
      ✨
    </motion.span>
  )
}

function LockedProgress({ badge, color }: { badge: BadgeState; color: string }) {
  if (isBinary(badge)) {
    return <span className="text-[14px] leading-tight font-bold text-muted">Le coup parfait 🤞</span>
  }
  const text = progressText(badge)
  return (
    <div className="mt-auto flex w-full flex-col gap-1.5">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-sunken">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(progressRatio(badge) * 100, badge.progress.current > 0 ? 6 : 0)}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 22, delay: 0.25 }}
        />
      </div>
      {text && (
        <span className="text-[14px] leading-none font-bold text-muted">
          <span className="score-num text-ink-soft">{text.value}</span> {text.unit}
        </span>
      )}
    </div>
  )
}
