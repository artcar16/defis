/**
 * « Check-in bouclé ✅ » : quand toutes les habitudes du jour sont remplies.
 * Score, statut de l'adversaire pour ce jour-là, et la suite (Ring, pesée, aujourd'hui).
 */
import { motion, useReducedMotion } from 'motion/react'
import type { Ref } from 'react'
import { RULES } from '../../config/rules'
import { NBSP, queName } from '../../core/fr'
import type { DayScore } from '../../core/scoring'
import type { Player } from '../../core/types'
import { deep, tint } from '../../ui/color'
import { Avatar, Button, springy } from '../../ui/kit'

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
  const max = RULES.week.dailyMax

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
        {score.perfect ? '🏆' : score.score >= max / 2 ? '🎉' : '🫡'}
      </motion.div>

      <h2 className="mt-2 font-display text-[28px] leading-tight font-bold text-balance text-ink">
        {isToday ? `Check-in bouclé${NBSP}✅` : `Hier, c’est bouclé${NBSP}✅`}
      </h2>
      <p className="mt-1 text-[16px] font-semibold text-balance text-ink-soft">
        <span className="score-num text-[18px] whitespace-nowrap" style={{ color: score.perfect ? 'var(--color-gold-dark)' : deep(me.color, 80) }}>
          {score.score}/{max}
        </span>{' '}
        {score.perfect
          ? 'Journée parfaite, rien à redire 💯'
          : score.score >= max * 0.75
            ? 'Grosse journée, bien joué 💪'
            : score.score >= max * 0.4
              ? `dans la boîte. Ça compte${NBSP}!`
              : isToday
                ? 'L’honnêteté paie toujours. Demain on se refait 💪'
                : 'L’honnêteté paie toujours. Aujourd’hui on se refait 💪'}
      </p>

      <OtherStatus other={other} score={score} otherScore={otherScore} isToday={isToday} />

      <div className="mt-5 flex flex-col gap-3">
        <Button size="lg" block className="text-balance" onClick={primary.onClick}>
          {primary.label}
        </Button>
        {secondary && (
          <Button variant="soft" size="md" block className="text-balance" onClick={secondary.onClick}>
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
  else if (score.score > otherScore.score)
    verdict = isToday ? `Tu fais mieux ${queName(n)} aujourd’hui 😏` : `Tu as fait mieux ${queName(n)} hier 😏`
  else if (score.score < otherScore.score)
    verdict = isToday ? `${n} fait mieux aujourd’hui… revanche demain 😤` : `${n} a fait mieux hier… à toi de jouer aujourd’hui 😤`
  else verdict = `Pile pareil ${queName(n)} ${isToday ? 'aujourd’hui' : 'hier'} 🤝`

  return (
    <motion.div
      layout="position"
      className="mt-4 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
      style={{ background: tint(other.color, 12, 'var(--color-sunken)') }}
    >
      <Avatar player={other} size="sm" />
      <div className="min-w-0 flex-1">
        {/* Le prénom n'est jamais tronqué : le statut passe à la ligne s'il manque de place. */}
        <div
          className="flex flex-wrap items-center gap-x-2 font-display text-[17px] leading-tight font-semibold"
          style={{ color: deep(other.color, 72) }}
        >
          <span className="min-w-0 break-words">{other.name}</span>
          <span className="shrink-0 whitespace-nowrap text-ink">
            {done ? (
              <>
                ✅ <span className="score-num">{otherScore.score}/{RULES.week.dailyMax}</span>
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
