/**
 * Bascule « Aujourd'hui / Hier » (rattrapage d'un oubli).
 * Le lundi, « Hier » est verrouillé 🔒 : la manche de la semaine dernière est close.
 */
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { springy } from '../../ui/kit'
import type { DayChoice } from './useCheckin'
import { tint } from './format'

export function DayToggle({
  choice,
  onChange,
  lockReason,
  missingYesterday,
}: {
  choice: DayChoice
  onChange: (c: DayChoice) => void
  /** Pourquoi « Hier » est verrouillé, ou null. */
  lockReason: string | null
  /** Habitudes encore vides hier (petite pastille). */
  missingYesterday: number
}) {
  const reduced = useReducedMotion() ?? false
  const nudge = useAnimationControls()
  const locked = lockReason !== null

  const tapYesterday = () => {
    if (!locked) return onChange('yesterday')
    if (!reduced) void nudge.start({ x: [0, -7, 7, -4, 4, 0], transition: { duration: 0.4 } })
  }

  return (
    <div>
      <div role="tablist" aria-label="Jour du check-in" className="relative grid grid-cols-2 gap-1 rounded-full bg-sunken p-1.5">
        <Segment active={choice === 'today'} onClick={() => onChange('today')} reduced={reduced}>
          <span aria-hidden="true">☀️</span> Aujourd’hui
        </Segment>
        <Segment
          active={choice === 'yesterday'}
          onClick={tapYesterday}
          disabled={locked}
          reduced={reduced}
          label={locked ? `Hier : ${lockReason}` : missingYesterday > 0 ? `Hier, ${missingYesterday} à remplir` : 'Hier'}
        >
          <span aria-hidden="true">{locked ? '🔒' : '⏪'}</span> Hier
          {!locked && missingYesterday > 0 && (
            <motion.span
              initial={reduced ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={springy}
              className="ml-0.5 grid h-6 min-w-6 place-items-center rounded-full px-1.5 font-display text-[14px] leading-none font-bold"
              style={{ background: 'var(--color-unpeu)', color: 'var(--color-ink)' }}
              aria-hidden="true"
            >
              {missingYesterday}
            </motion.span>
          )}
        </Segment>
      </div>

      <AnimatePresence initial={false}>
        {locked && (
          <motion.p
            animate={nudge}
            className="mt-2 rounded-2xl px-3 py-1.5 text-center text-[15px] font-semibold text-muted"
            style={{ background: tint('var(--color-muted)', 8, 'transparent') }}
          >
            {lockReason}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function Segment({
  active,
  disabled = false,
  onClick,
  reduced,
  label,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  reduced: boolean
  label?: string
  children: ReactNode
}) {
  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      aria-label={label}
      onClick={onClick}
      whileTap={reduced ? undefined : { scale: 0.94 }}
      transition={springy}
      className={`relative flex min-h-12 items-center justify-center gap-1.5 rounded-full px-3 font-display text-[17px] font-semibold transition-colors ${
        active ? 'text-ink' : disabled ? 'text-muted opacity-60' : 'text-ink-soft'
      }`}
    >
      {active && (
        <motion.span
          layoutId="checkin-day-pill"
          className="absolute inset-0 rounded-full bg-surface shadow-[var(--shadow-card)]"
          style={{ boxShadow: '0 3px 0 var(--color-line), var(--shadow-card)' }}
          transition={reduced ? { duration: 0 } : springy}
        />
      )}
      <span className="relative flex items-center gap-1.5">{children}</span>
    </motion.button>
  )
}
