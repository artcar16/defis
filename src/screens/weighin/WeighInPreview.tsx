/**
 * Aperçu en direct pendant la saisie : variation en %, points, réaction emoji.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { RULES } from '../../config/rules'
import { weighInBucket, weighInReaction } from '../../core/taunts'
import type { DayKey } from '../../core/types'
import { formatPct } from '../../core/weight'
import { AnimatedNumber, Card, ProgressBar, springy } from '../../ui/kit'
import type { WeighInPreview as Preview } from './useWeighIn'

const MAX = RULES.weighIn.maxPoints
const FULL_LOSS = formatPct(-RULES.weighIn.fullPointsLossPct, 0)

export function WeighInPreview({ preview, seed }: { preview: Preview; seed: DayKey }) {
  const reduced = useReducedMotion() ?? false
  const { first, changePct, points, inGoalZone } = preview
  const reaction = weighInReaction(changePct, points, seed)
  const bucket = weighInBucket(changePct, points)
  const scoring = points > 0

  return (
    <Card className="p-3">
      <div className="grid grid-cols-2 gap-2.5">
        {/* Variation */}
        <div className="rounded-[22px] bg-sunken px-3 py-3 text-center">
          <p className="text-[13px] font-bold tracking-wide text-muted uppercase">Variation</p>
          {first ? (
            <p className="mt-1 font-display text-[26px] leading-tight font-bold text-ink">Départ 📍</p>
          ) : (
            <p className="score-num mt-1 text-[30px] leading-tight text-ink">{formatPct(changePct, 2)}</p>
          )}
          <p className="mt-0.5 text-[13px] font-semibold text-muted">{first ? 'première pesée' : 'vs la dernière pesée'}</p>
        </div>

        {/* Points */}
        <div
          className="rounded-[22px] px-3 py-3 text-center transition-colors"
          style={{
            background: scoring ? 'color-mix(in oklab, var(--color-nickel) 16%, var(--color-surface))' : 'var(--color-sunken)',
          }}
        >
          <p className="text-[13px] font-bold tracking-wide text-muted uppercase">Points</p>
          <p
            className="mt-1 flex items-baseline justify-center gap-1 text-[30px] leading-tight"
            style={{ color: scoring ? 'color-mix(in oklab, var(--color-nickel) 70%, var(--color-ink))' : 'var(--color-ink-soft)' }}
          >
            {scoring && <span className="score-num">+</span>}
            <AnimatedNumber value={points} />
            <span className="font-display text-[15px] font-semibold text-muted">{points > 1 ? 'pts' : 'pt'}</span>
          </p>
          <ProgressBar value={points} max={MAX} color="var(--color-nickel)" className="mx-auto mt-1.5 h-2! w-[86%]" />
        </div>
      </div>

      {/* Réaction */}
      <div className="mt-3 flex items-center gap-3 px-1">
        <div className="grid size-14 shrink-0 place-items-center">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={bucket}
              className="emoji-xl text-[48px]"
              initial={reduced ? { opacity: 0 } : { scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { scale: 0, rotate: 25 }}
              transition={springy}
              aria-hidden="true"
            >
              {reaction.emoji}
            </motion.span>
          </AnimatePresence>
        </div>
        <p className="text-[16px] leading-snug font-bold text-ink" aria-live="polite">
          {first ? 'Point de départ 📍 Cette pesée ne rapporte rien, elle sert de référence.' : reaction.text}
        </p>
      </div>

      {inGoalZone && !first && (
        <motion.p
          className="mt-3 rounded-[18px] px-3 py-2 text-center text-[15px] font-bold"
          style={{ background: 'color-mix(in oklab, var(--color-gold) 22%, transparent)', color: 'color-mix(in oklab, var(--color-gold-dark) 60%, var(--color-ink))' }}
          initial={reduced ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springy}
        >
          🎯 Zone objectif : {MAX} pts assurés !
        </motion.p>
      )}

      <p className="mt-3 px-1 text-center text-[13px] font-semibold text-muted">
        {FULL_LOSS} ou plus = {MAX} pts (le max) · entre les deux, au prorata
      </p>
    </Card>
  )
}
