/**
 * La jauge du score du jour (dans la couleur du joueur), qui monte en direct à chaque tap,
 * avec la phrase de réaction. Une mini-jauge flottante prend le relais quand on descend.
 */
import { AnimatePresence, motion, useAnimationControls, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { RULES } from '../../config/rules'
import { plural } from '../../core/fr'
import type { DayScore } from '../../core/scoring'
import type { Player } from '../../core/types'
import { deep, tint } from '../../ui/color'
import { AnimatedNumber, VALUE_COLORS, springy } from '../../ui/kit'
import type { HabitRow } from './useCheckin'

const SIZE = 148
const STROKE = 17
const R = (SIZE - STROKE) / 2
/** Score maximum d'une journée (règles). */
const MAX = RULES.week.dailyMax

export function ScoreGauge({
  me,
  score,
  rows,
  line,
  celebrateKey,
}: {
  me: Player
  score: DayScore
  rows: HabitRow[]
  line: string
  /** Change quand la journée devient parfaite (petite fête sur la jauge). */
  celebrateKey: number
}) {
  const reduced = useReducedMotion() ?? false
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { initial: true, margin: '-24px 0px 0px 0px' })
  const pct = score.score / MAX

  return (
    <>
      <motion.section
        ref={ref}
        className="card relative overflow-visible p-4"
        aria-label="Score du jour"
        style={{
          background: score.perfect
            ? `linear-gradient(160deg, ${tint('var(--color-gold)', 22)}, var(--color-surface) 70%)`
            : `linear-gradient(160deg, ${tint(me.color, 10)}, var(--color-surface) 70%)`,
        }}
      >
        <div className="flex items-center gap-4">
          <Gauge me={me} pct={pct} score={score} reduced={reduced} celebrateKey={celebrateKey} />

          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] font-semibold tracking-wide text-muted uppercase">Score du jour</div>
            <div className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
              {rows.map((r) => (
                <HabitDot key={r.habit.id} row={r} reduced={reduced} />
              ))}
            </div>
            <div className="mt-2 font-display text-[18px] leading-tight font-semibold text-ink-soft">
              <AnimatedNumber value={score.filled} />/{plural(score.total, 'habitude')}
              {score.complete && <span className="ml-1">✅</span>}
            </div>
          </div>
        </div>

        {/* Phrase de réaction, en bulle. */}
        <div className="relative mt-4">
          <span
            className="absolute -top-1.5 left-[62px] size-4 rotate-45 rounded-[3px]"
            style={{ background: tint(me.color, 12, 'var(--color-sunken)') }}
            aria-hidden="true"
          />
          <div
            className="relative min-h-12 overflow-hidden rounded-2xl px-4 py-3"
            style={{ background: tint(me.color, 12, 'var(--color-sunken)') }}
            aria-live="polite"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={line}
                className="text-[16px] leading-snug font-bold text-pretty text-ink"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
                transition={reduced ? { duration: 0.15 } : springy}
              >
                {line}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </motion.section>

      <FloatingScore me={me} score={score} show={!inView} reduced={reduced} />
    </>
  )
}

/** Anneau de progression + score au centre. */
function Gauge({
  me,
  pct,
  score,
  reduced,
  celebrateKey,
}: {
  me: Player
  pct: number
  score: DayScore
  reduced: boolean
  celebrateKey: number
}) {
  const color = score.perfect ? 'var(--color-gold)' : me.color
  const party = useAnimationControls()
  useEffect(() => {
    if (celebrateKey > 0 && !reduced) void party.start({ scale: [1, 1.14, 0.95, 1], rotate: [0, -5, 4, 0], transition: { duration: 0.7 } })
  }, [celebrateKey, reduced, party])
  return (
    <motion.div className="relative size-[min(148px,38vw,20svh)] shrink-0" animate={party}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90" aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={tint(me.color, 18, 'var(--color-sunken)')} strokeWidth={STROKE} />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: Math.max(pct, 0.0001), opacity: pct > 0 ? 1 : 0 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18 }}
          style={{ filter: `drop-shadow(0 3px 6px color-mix(in oklab, ${me.color} 45%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center leading-none">
          <AnimatedNumber value={score.score} className="text-[min(52px,14vw,7svh)]" />
          <span className="mt-0.5 font-display text-[16px] font-semibold text-muted">/{MAX}</span>
        </div>
      </div>
      <AnimatePresence>
        {score.perfect && (
          <motion.span
            className="absolute -top-2 -right-2 grid size-12 place-items-center rounded-full bg-surface text-[28px] shadow-[var(--shadow-pop)]"
            initial={reduced ? false : { scale: 0, rotate: -40 }}
            animate={{ scale: 1, rotate: 12 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={springy}
            aria-label="Journée parfaite"
            role="img"
          >
            💯
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Petite pastille par habitude : grisée tant qu'elle n'est pas remplie. */
function HabitDot({ row, reduced }: { row: HabitRow; reduced: boolean }) {
  const c = row.value ? VALUE_COLORS[row.value] : null
  return (
    <motion.span
      key={row.value ?? 'empty'}
      className="grid size-9 place-items-center rounded-full text-[19px] leading-none"
      initial={reduced || !row.value ? false : { scale: 0.4 }}
      animate={{ scale: 1 }}
      transition={springy}
      style={
        c
          ? { background: tint(c, 22), boxShadow: `inset 0 0 0 2.5px ${c}` }
          : { background: 'var(--color-sunken)', boxShadow: 'inset 0 0 0 2px var(--color-line)', filter: 'grayscale(1)', opacity: 0.55 }
      }
    >
      {row.habit.emoji}
    </motion.span>
  )
}

/** Mini-score flottant en haut de l'écran quand la jauge sort de l'écran. */
function FloatingScore({ me, score, show, reduced }: { me: Player; score: DayScore; show: boolean; reduced: boolean }) {
  const color = score.perfect ? 'var(--color-gold)' : me.color
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="safe-top pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4"
          initial={reduced ? { opacity: 0 } : { y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: -80, opacity: 0 }}
          transition={reduced ? { duration: 0.15 } : springy}
          aria-hidden="true"
        >
          <div
            className="flex items-center gap-2.5 rounded-full bg-surface py-1.5 pr-4 pl-1.5 shadow-[var(--shadow-pop)]"
            style={{ boxShadow: `inset 0 0 0 2.5px ${tint(color, 55, 'transparent')}, var(--shadow-pop)` }}
          >
            <MiniRing pct={score.score / MAX} color={color} reduced={reduced} />
            <span
              className="font-display text-[20px] leading-none font-bold"
              style={{ color: score.perfect ? 'var(--color-gold-dark)' : deep(me.color, 80) }}
            >
              <AnimatedNumber value={score.score} />
              <span className="text-[14px] text-muted">/{MAX}</span>
            </span>
            <span className="font-display text-[15px] font-semibold text-muted">
              · {score.filled}/{score.total} {score.complete ? '✅' : ''}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function MiniRing({ pct, color, reduced }: { pct: number; color: string; reduced: boolean }) {
  const s = 34
  const w = 6
  const r = (s - w) / 2
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="-rotate-90">
      <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="var(--color-sunken)" strokeWidth={w} />
      <motion.circle
        cx={s / 2}
        cy={s / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: Math.max(pct, 0.0001), opacity: pct > 0 ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : softSpringRing}
      />
    </svg>
  )
}

const softSpringRing = { type: 'spring', stiffness: 160, damping: 20 } as const
