/**
 * 🏆 Bilan global des manches + 🏅 badges débloqués pendant la manche.
 */
import { motion, useReducedMotion } from 'motion/react'
import { joinFr, plural } from '../../core/fr'
import type { Player } from '../../core/types'
import { deep, tint } from '../../ui/color'
import { Avatar, Card, springy } from '../../ui/kit'
import type { WeekResults } from './useWeekResults'

export function RecordStrip({ results }: { results: WeekResults }) {
  const { record, left, right, week } = results
  const l = record.wins[left.id] ?? 0
  const r = record.wins[right.id] ?? 0
  return (
    <Card className="px-4 py-3">
      <p className="text-center text-[13px] font-bold tracking-wide text-muted uppercase">
        🏆 {week.finished ? `Bilan après la manche ${week.index}` : 'Bilan des manches'}
      </p>
      {/* Avatar au-dessus du prénom : le prénom entier tient même sur iPhone SE. */}
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <RecordSide player={left} />
        <span className="score-num text-[30px] leading-none whitespace-nowrap text-ink">
          <span style={{ color: deep(left.color, 82) }}>{l}</span>
          <span className="mx-1.5 text-muted">–</span>
          <span style={{ color: deep(right.color, 82) }}>{r}</span>
        </span>
        <RecordSide player={right} />
      </div>
      {record.ties > 0 && <p className="mt-1 text-center text-[13px] font-semibold text-muted">+ {plural(record.ties, 'égalité')} 🤝</p>}
    </Card>
  )
}

function RecordSide({ player }: { player: Player }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <Avatar player={player} size="sm" />
      <span className="max-w-full truncate font-display text-[16px] leading-tight font-semibold" style={{ color: deep(player.color, 72) }}>
        {player.name}
      </span>
    </div>
  )
}

export function WeekBadges({ results }: { results: WeekResults }) {
  const reduced = useReducedMotion() ?? false
  if (results.badges.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {results.badges.map(({ player, badge, tiers }, i) => (
        <motion.div
          key={`${player.id}-${badge.id}`}
          className="flex min-h-12 items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 shadow-[var(--shadow-card)]"
          style={{ background: tint(player.color, 18) }}
          initial={reduced ? false : { scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...springy, delay: 0.1 + i * 0.08 }}
        >
          <span className="grid size-9 place-items-center rounded-full bg-surface text-[22px]" aria-hidden="true">
            {badge.emoji}
          </span>
          <span className="text-[15px] leading-tight font-bold text-ink">
            {badge.name}
            {tiers.length > 0 && <span className="font-semibold text-ink-soft"> {joinFr(tiers)}</span>}
            <span className="block text-[13px] font-semibold" style={{ color: deep(player.color, 70) }}>
              {player.name}
            </span>
          </span>
        </motion.div>
      ))}
    </div>
  )
}
