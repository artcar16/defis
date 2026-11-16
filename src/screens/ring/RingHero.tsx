/**
 * La grande carte du Ring : scores face à face, tir à la corde, phrase du commentateur.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { DayScore } from '../../core/scoring'
import { AnimatedNumber, Pill, springy } from '../../ui/kit'
import { TugOfWar, type ArenaPulse } from './TugOfWar'
import type { RingData, RingSide } from './useRingData'

export function RingHero({ data, pulse }: { data: RingData; pulse: ArenaPulse | null }) {
  const reduced = useReducedMotion() ?? false
  const calm = data.me.total === 0 && data.other.total === 0

  return (
    <motion.section
      className="card relative overflow-hidden"
      initial={reduced ? false : { opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      aria-label="Le ring"
    >
      {/* Tableau des scores, façon jeu de combat. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1 px-4 pt-4">
        <ScoreSide side={data.me} align="left" isMe pulseKey={null} />
        <VsBadge reduced={reduced} />
        <ScoreSide side={data.other} align="right" isMe={false} pulseKey={pulse?.key ?? null} />
      </div>

      <TugOfWar
        left={data.me.player}
        right={data.other.player}
        leftStanding={data.me.standing}
        lean={data.lean}
        gap={data.gap}
        bounceKey={`${data.me.total}:${data.other.total}`}
        pulse={pulse}
        calm={calm}
      />

      <Commentator text={data.taunt} reduced={reduced} />
    </motion.section>
  )
}

// ─── Scores ──────────────────────────────────────────────────────────────────

function ScoreSide({
  side,
  align,
  isMe,
  pulseKey,
}: {
  side: RingSide
  align: 'left' | 'right'
  isMe: boolean
  pulseKey: number | null
}) {
  const { player, total, today } = side
  const right = align === 'right'
  return (
    <div className={`relative flex min-w-0 flex-col gap-1 ${right ? 'items-end text-right' : 'items-start text-left'}`}>
      {/* Flash quand l'adversaire joue en direct. */}
      {pulseKey !== null && (
        <motion.span
          key={pulseKey}
          className="pointer-events-none absolute -inset-2 rounded-[20px]"
          style={{ background: `color-mix(in oklab, ${player.color} 22%, transparent)` }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.8, ease: 'easeOut' }}
        />
      )}
      <div
        className={`relative flex max-w-full items-center gap-1.5 font-display text-[17px] leading-tight font-semibold ${right ? 'flex-row-reverse' : ''}`}
        style={{ color: `color-mix(in oklab, ${player.color} 72%, var(--color-ink))` }}
      >
        <span className="truncate">{player.name}</span>
        {isMe && (
          <span
            className="shrink-0 rounded-full px-1.5 py-px text-[11px] font-bold tracking-wide uppercase"
            style={{ background: `color-mix(in oklab, ${player.color} 18%, transparent)` }}
          >
            toi
          </span>
        )}
      </div>
      <div className="relative flex items-baseline gap-1">
        <span style={{ color: `color-mix(in oklab, ${player.color} 88%, var(--color-ink))` }}>
          <AnimatedNumber value={total} className="text-[clamp(36px,11.8vw,46px)] leading-none" />
        </span>
        <span className="font-display text-[15px] font-semibold text-muted">pts</span>
      </div>
      <TodayStatus day={today} />
    </div>
  )
}

/** ✅ check-in fait · ✏️ en cours · 👀 pas encore. */
function TodayStatus({ day }: { day: DayScore }) {
  const state = day.complete ? 'done' : day.filled > 0 ? 'partial' : 'todo'
  return (
    <motion.span
      key={state}
      className="relative whitespace-nowrap"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springy}
    >
      {state === 'done' ? (
        <Pill color="var(--color-nickel)">✅ check-in fait</Pill>
      ) : state === 'partial' ? (
        <Pill color="var(--color-unpeu)">
          ✏️ en cours · {day.filled}/{day.total}
        </Pill>
      ) : (
        <Pill>👀 pas encore</Pill>
      )}
    </motion.span>
  )
}

function VsBadge({ reduced }: { reduced: boolean }) {
  return (
    <motion.div
      className="mt-6 grid size-12 place-items-center rounded-full font-display text-[17px] font-bold ring-4 ring-surface"
      style={{
        background: 'radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--color-gold) 40%, white), var(--color-gold) 60%, var(--color-gold-dark))',
        color: 'color-mix(in oklab, var(--color-gold-dark) 35%, black)',
        boxShadow: '0 6px 14px -6px color-mix(in oklab, var(--color-gold-dark) 80%, black)',
      }}
      animate={reduced ? undefined : { rotate: [-8, 8, -8], scale: [1, 1.07, 1] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden="true"
    >
      VS
    </motion.div>
  )
}

// ─── Le commentateur ─────────────────────────────────────────────────────────

export function Commentator({ text, reduced }: { text: string; reduced: boolean }) {
  return (
    <div className="relative mx-3 mt-1 mb-3 rounded-[22px] bg-sunken px-4 py-3">
      <span className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 rounded-[3px] bg-sunken" aria-hidden="true" />
      <div className="relative flex items-center gap-3">
        <motion.span
          className="shrink-0 text-[30px] leading-none"
          animate={reduced ? undefined : { rotate: [0, -12, 6, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 3.5 }}
          aria-hidden="true"
        >
          🎙️
        </motion.span>
        <div className="min-w-0 flex-1" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={text}
              className="text-[16px] leading-snug font-bold text-ink"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              {text}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
