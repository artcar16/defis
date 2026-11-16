/**
 * Une carte par habitude, avec de gros boutons emoji :
 * 3 états pour « à éviter » (😇 😬 🙈), 2 pour « à faire » (💪 🛋️).
 * Un tap = enregistré. Rebond au tap, réponse choisie bien colorée, les autres en retrait.
 */
import { AnimatePresence, motion, useAnimationControls, useReducedMotion, type TargetAndTransition } from 'motion/react'
import { useState, type Ref } from 'react'
import { formatPts, formatSignedPts } from '../../core/fr'
import { pointsFor, valuesFor } from '../../core/scoring'
import type { CheckinValue } from '../../core/types'
import { deep, tint } from '../../ui/color'
import { VALUE_COLORS, VALUE_LABELS, springy } from '../../ui/kit'
import { KIND_LABELS, shadeOf } from './format'
import type { HabitRow } from './useCheckin'

interface HabitCardProps {
  row: HabitRow
  /** false = lecture seule (jour verrouillé). */
  editable: boolean
  onAnswer: (value: CheckinValue) => void
  /** Rang d'apparition (petit décalage à l'entrée). */
  index: number
  ref?: Ref<HTMLElement>
}

export function HabitCard({ row, editable, onAnswer, index, ref }: HabitCardProps) {
  const reduced = useReducedMotion() ?? false
  const { habit, value } = row
  const values = valuesFor(habit.kind)
  const c = value ? VALUE_COLORS[value] : null
  const tile = useAnimationControls()

  const pick = (v: CheckinValue) => {
    if (!reduced) void tile.start({ rotate: [0, -12, 9, -4, 0], scale: [1, 1.12, 1], transition: { duration: 0.5 } })
    onAnswer(v)
  }

  return (
    <motion.article
      ref={ref}
      className="card relative scroll-mt-24 p-4"
      initial={reduced ? false : { opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...springy, delay: reduced ? 0 : 0.04 * index }}
      style={{
        boxShadow: c ? `inset 0 0 0 3px ${tint(c, 45, 'transparent')}, var(--shadow-card)` : undefined,
      }}
      aria-label={habit.name}
    >
      {/* Tuile emoji | nom + précision | points. Sous 360 px, les points passent sous la précision
          pour laisser toute la largeur au nom (jamais tronqué : il passe à la ligne). */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 min-[360px]:grid-cols-[auto_minmax(0,1fr)_auto]">
        <motion.div
          className="row-span-2 grid size-16 place-items-center rounded-[20px] text-[40px] leading-none min-[360px]:row-span-1"
          style={{ background: c ? tint(c, 20) : 'var(--color-sunken)' }}
          animate={tile}
          aria-hidden="true"
        >
          <span className="drop-shadow-[0_4px_4px_rgb(43_29_63_/_0.15)]">{habit.emoji}</span>
        </motion.div>

        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-[clamp(19px,6vw,22px)] leading-tight font-bold text-ink">
            <span className="min-w-0 break-words text-balance hyphens-auto">{habit.name}</span>
            {row.lastWeek && (
              <span className="rounded-full bg-sunken px-2 py-0.5 font-body text-[14px] font-bold whitespace-nowrap text-muted">dernière semaine 👋</span>
            )}
          </h3>
          <p className="mt-0.5 text-[15px] leading-snug font-semibold text-pretty break-words text-muted">
            {habit.hint || (habit.kind === 'avoid' ? 'À éviter' : 'À faire')}
          </p>
        </div>

        <div className="relative col-start-2 row-start-2 mt-2 flex min-[360px]:col-start-3 min-[360px]:row-start-1 min-[360px]:mt-0">
          <PointsBadge row={row} reduced={reduced} />
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={`${habit.name} (${KIND_LABELS[habit.kind]})`}
        className={`mt-4 grid gap-2.5 ${values.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        {values.map((v) => (
          <ChoiceButton
            key={v}
            value={v}
            points={pointsFor(habit.kind, v)}
            selected={value === v}
            dimmed={value !== null && value !== v}
            disabled={!editable}
            reduced={reduced}
            onPick={() => pick(v)}
          />
        ))}
      </div>
    </motion.article>
  )
}

/** « +10 pts » dans la couleur de la réponse, ou « à remplir ». */
function PointsBadge({ row, reduced }: { row: HabitRow; reduced: boolean }) {
  const c = row.value ? VALUE_COLORS[row.value] : null
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {c ? (
        <motion.span
          key={row.value}
          className="shrink-0 rounded-full px-2.5 py-1 font-display text-[16px] font-bold"
          style={{ background: tint(c, 18, 'transparent'), color: deep(c, 78) }}
          initial={reduced ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={springy}
        >
          {formatSignedPts(row.points)}
        </motion.span>
      ) : (
        <motion.span
          key="empty"
          className="shrink-0 rounded-full border-2 border-dashed border-line px-2.5 py-0.5 font-display text-[14px] font-semibold text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          à remplir
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/** Petite animation propre à chaque réponse : rebond si c'est bien, secousse si c'est un craquage. */
function popFor(value: CheckinValue): TargetAndTransition {
  switch (value) {
    case 'nickel':
    case 'fait':
      return { scale: [1, 1.45, 0.9, 1.1, 1], rotate: [0, -12, 10, 0, 0], y: [0, -10, 0, 0, 0] }
    case 'unpeu':
      return { scale: [1, 1.25, 1], rotate: [0, -16, 14, -8, 0] }
    default:
      return { scale: [1, 1.2, 1], x: [0, -6, 6, -5, 5, 0] }
  }
}

function ChoiceButton({
  value,
  points,
  selected,
  dimmed,
  disabled,
  reduced,
  onPick,
}: {
  value: CheckinValue
  points: number
  selected: boolean
  dimmed: boolean
  disabled: boolean
  reduced: boolean
  onPick: () => void
}) {
  const { emoji, label } = VALUE_LABELS[value]
  const c = VALUE_COLORS[value]
  const pop = useAnimationControls()
  // Change à chaque nouvelle réponse : relance le « +10 » qui s'envole.
  const [flyKey, setFlyKey] = useState(0)

  const pick = () => {
    if (disabled) return
    if (!reduced) void pop.start({ ...popFor(value), transition: { duration: 0.55, ease: 'easeOut' } })
    if (selected) return // déjà choisi : juste un petit rebond, rien à enregistrer
    setFlyKey((n) => n + 1)
    onPick()
  }

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      aria-label={`${label}, ${formatPts(points)}`}
      onClick={pick}
      whileTap={disabled || reduced ? undefined : { scale: 0.9, y: 3 }}
      animate={{ opacity: dimmed ? 0.5 : 1, scale: selected && !reduced ? [0.92, 1.06, 1] : 1 }}
      initial={false}
      transition={springy}
      className={`relative flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-[20px] px-1 pt-2 pb-2.5 ${
        disabled ? 'cursor-not-allowed' : ''
      }`}
      style={
        selected
          ? {
              background: tint(c, 24),
              boxShadow: `inset 0 0 0 3px ${c}, 0 5px 0 ${shadeOf(c)}`,
            }
          : {
              background: 'var(--color-sunken)',
              boxShadow: `inset 0 0 0 2px var(--color-line), 0 5px 0 var(--color-line)`,
            }
      }
    >
      <motion.span
        className="text-[38px] leading-none"
        style={{ filter: dimmed ? 'grayscale(0.7)' : undefined }}
        animate={pop}
        aria-hidden="true"
      >
        {emoji}
      </motion.span>
      <span
        className="font-display text-[16px] leading-none font-semibold"
        style={{ color: selected ? deep(c, 70) : 'var(--color-ink-soft)' }}
      >
        {label}
      </span>
      <span className="font-display text-[13px] leading-none font-semibold" style={{ color: selected ? deep(c, 60) : 'var(--color-muted)' }}>
        {formatPts(points)}
      </span>

      {/* Les points qui s'envolent. */}
      <AnimatePresence>
        {flyKey > 0 && !reduced && (
          <motion.span
            key={flyKey}
            className="pointer-events-none absolute -top-2 left-1/2 z-10 font-display text-[22px] font-bold whitespace-nowrap"
            style={{ color: deep(c, 80), textShadow: '0 2px 0 var(--color-surface)' }}
            initial={{ x: '-50%', y: 0, opacity: 1, scale: 0.7 }}
            animate={{ x: '-50%', y: -42, opacity: 0, scale: 1.25 }}
            transition={{ duration: 0.85, ease: 'easeOut' }}
            aria-hidden="true"
          >
            {points > 0 ? `+${points}` : '+0'}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
