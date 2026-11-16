/**
 * « Check-in bouclé ✅ » : quand toutes les habitudes du jour sont remplies.
 * Score, statut de l'adversaire pour ce jour-là, et la suite (Ring, pesée, aujourd'hui).
 */
import { motion, useReducedMotion } from 'motion/react'
import type { Ref } from 'react'
import type { DayScore } from '../../core/scoring'
import type { Player } from '../../core/types'
import { Avatar, Button, springy } from '../../ui/kit'
import { inkOf, tint } from './format'

export interface DoneAction {
  label: string
  onClick: () => void
}

export function DoneCard({
  me,
  other,
  score,
  otherScore,
  isToday,
  primary,
  secondary,
  ref,
}: {
  me: Player
  other: Player
  score: DayScore
  otherScore: DayScore
  /** Le jour affiché est aujourd'hui (sinon : hier). */
  isToday: boolean
  primary: DoneAction
  secondary?: DoneAction
  ref?: Ref<HTMLElement>
}) {
  const reduced = useReducedMotion() ?? false
  const accent = score.perfect ? 'var(--color-gold)' : 'var(--color-nickel)'

  return (
    <motion.section
      ref={ref}
      className="card relative scroll-mt-24 overflow-hidden px-5 pt-6 pb-5 text-center"
      initial={reduced ? false : { opacity: 0, scale: 0.9, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      style={{ background: `linear-gradient(180deg, ${tint(accent, 16)}, var(--color-surface) 70%)` }}
      aria-live="polite"
    >
      <motion.div
        className="emoji-xl text-[72px]!"
        initial={reduced ? false : { scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ ...springy, delay: reduced ? 0 : 0.12 }}
        aria-hidden="true"
      >
        {score.perfect ? '🏆' : score.score >= 50 ? '🎉' : '🫡'}
      </motion.div>

      <h2 className="mt-2 font-display text-[28px] leading-tight font-bold text-ink">
        {isToday ? 'Check-in bouclé ✅' : 'Hier, c’est bouclé ✅'}
      </h2>
      <p className="mt-1 text-[16px] font-semibold text-ink-soft">
        <span className="score-num text-[18px]" style={{ color: score.perfect ? 'var(--color-gold-dark)' : inkOf(me.color, 80) }}>
          {score.score}/100
        </span>{' '}
        {score.perfect
          ? 'Journée parfaite, rien à redire 💯'
          : score.score >= 75
            ? 'Grosse journée, bien joué 💪'
            : score.score >= 40
              ? 'dans la boîte. Ça compte !'
              : 'L’honnêteté paie toujours. Demain on se refait 💪'}
      </p>

      <OtherStatus other={other} score={score} otherScore={otherScore} isToday={isToday} />

      <div className="mt-5 flex flex-col gap-3">
        <Button size="lg" block onClick={primary.onClick}>
          {primary.label}
        </Button>
        {secondary && (
          <Button variant="soft" size="md" block onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        )}
      </div>
    </motion.section>
  )
}

/** Où en est l'autre ce jour-là : ✅ fait (avec son score) ou 👀 pas encore. */
function OtherStatus({
  other,
  score,
  otherScore,
  isToday,
}: {
  other: Player
  score: DayScore
  otherScore: DayScore
  isToday: boolean
}) {
  const done = otherScore.complete
  const n = other.name
  let verdict: string
  if (!done) verdict = isToday ? 'Pendant ce temps-là, tu prends de l’avance 😏' : 'Hier n’est pas encore bouclé de son côté 👀'
  else if (score.score > otherScore.score) verdict = isToday ? `Tu fais mieux que ${n} aujourd’hui 😏` : `Tu as fait mieux que ${n} hier 😏`
  else if (score.score < otherScore.score)
    verdict = isToday ? `${n} fait mieux aujourd’hui… revanche demain 😤` : `${n} a fait mieux hier… à toi de jouer aujourd’hui 😤`
  else verdict = `Pile pareil que ${n} ${isToday ? 'aujourd’hui' : 'hier'} 🤝`

  return (
    <motion.div
      layout="position"
      className="mt-4 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
      style={{ background: tint(other.color, 12, 'var(--color-sunken)') }}
    >
      <Avatar player={other} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-display text-[17px] leading-tight font-semibold" style={{ color: inkOf(other.color) }}>
          <span className="truncate">{other.name}</span>
          <span className="shrink-0 text-ink">
            {done ? (
              <>
                ✅ <span className="score-num">{otherScore.score}/100</span>
              </>
            ) : (
              '👀 pas encore'
            )}
          </span>
        </div>
        <div className="mt-0.5 text-[15px] leading-snug font-semibold text-ink-soft">{verdict}</div>
      </div>
    </motion.div>
  )
}
