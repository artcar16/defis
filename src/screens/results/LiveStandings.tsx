/**
 * ⏳ Manche en cours : pas de cérémonie, juste le classement provisoire.
 */
import { motion, useReducedMotion } from 'motion/react'
import { addDays } from '../../core/dates'
import { formatPts, frDate, NBSP, plural, ptsUnit, typo, weekRangeLabel } from '../../core/fr'
import type { Player } from '../../core/types'
import { deep, tint } from '../../ui/color'
import { AnimatedNumber, Avatar, Pill, springy } from '../../ui/kit'
import type { WeekResults } from './useWeekResults'

export function LiveStandings({ results, meId }: { results: WeekResults; meId: string }) {
  const reduced = useReducedMotion() ?? false
  const { week, left, right, winner, tie, gap } = results
  const leaderLine = tie
    ? week.scores[left.id]?.total === 0
      ? 'Tout reste à jouer 🥊'
      : 'Égalité parfaite pour l’instant 🤝'
    : `${winner?.name} mène de ${formatPts(gap)} ${winner?.id === meId ? '😎' : '😤'}`

  return (
    <section className="pt-1 text-center" aria-label="Manche en cours">
      <Pill color="var(--color-unpeu)">
        ⏳ {week.daysLeft >= 2 ? `Encore ${plural(week.daysLeft, 'jour')}` : `Dernier jour${NBSP}!`}
      </Pill>
      <h2 className="mt-2 font-display text-[28px] leading-tight font-bold text-ink">Manche {week.index}</h2>
      <p className="text-[15px] font-semibold text-muted">{weekRangeLabel(week.weekStart, week.weekEnd)}</p>

      <div className="card mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-3 py-4">
        <Side player={left} total={week.scores[left.id]?.total ?? 0} leads={!tie && winner?.id === left.id} isMe={left.id === meId} reduced={reduced} />
        <span className="mt-8 font-display text-[17px] font-bold text-muted">VS</span>
        <Side player={right} total={week.scores[right.id]?.total ?? 0} leads={!tie && winner?.id === right.id} isMe={right.id === meId} reduced={reduced} />
      </div>

      <p className="mt-3 font-display text-[19px] font-semibold text-ink">{leaderLine}</p>
      <p className="mt-0.5 text-[15px] font-semibold text-muted">{typo(`Verdict ${frDate(addDays(week.weekEnd, 1))} 🔔 Rien n’est joué !`)}</p>
    </section>
  )
}

function Side({ player, total, leads, isMe, reduced }: { player: Player; total: number; leads: boolean; isMe: boolean; reduced: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="relative">
        <Avatar player={player} size="lg" />
        {leads && (
          <motion.span
            className="absolute inset-x-0 -top-7 flex justify-center text-[34px] leading-none opacity-80"
            initial={reduced ? false : { y: -30, opacity: 0, rotate: -30 }}
            animate={{ y: 0, opacity: 0.85, rotate: -12 }}
            transition={springy}
            aria-label="En tête (provisoire)"
            role="img"
          >
            👑
          </motion.span>
        )}
      </div>
      <p className="mt-2 flex max-w-full items-center gap-1 font-display text-[16px] font-semibold" style={{ color: deep(player.color, 72) }}>
        <span className="truncate">{player.name}</span>
        {isMe && (
          <span className="shrink-0 rounded-full px-1.5 py-px text-[11px] font-bold uppercase" style={{ background: tint(player.color, 20) }}>
            toi
          </span>
        )}
      </p>
      <span className="flex items-baseline gap-1" style={{ color: deep(player.color, 82) }}>
        <AnimatedNumber value={total} className="text-[40px] leading-none" />
        <span className="font-display text-[14px] font-semibold text-muted">{ptsUnit(total)}</span>
      </span>
      <span className={`mt-1 text-[13px] font-bold text-muted ${leads ? '' : 'invisible'}`} aria-hidden={!leads}>
        en tête (provisoire)
      </span>
    </div>
  )
}
