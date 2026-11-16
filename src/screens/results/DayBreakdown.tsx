/**
 * 📅 Le détail jour par jour des deux joueurs : 7 jours + pesée + total,
 * mini-barres aux couleurs des joueurs, ⭐ pour les journées parfaites.
 */
import { motion, useReducedMotion } from 'motion/react'
import { RULES } from '../../config/rules'
import { formatDay } from '../../core/dates'
import type { PlayerWeekScore } from '../../core/scoring'
import type { DayKey, Player } from '../../core/types'
import { formatPct } from '../../core/weight'
import { Avatar, Card, softSpring } from '../../ui/kit'
import { capitalize, deep, tint } from '../weighin/format'
import type { WeekResults } from './useWeekResults'

const ROW = 'grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3'

export function DayBreakdown({ results, today }: { results: WeekResults; today: DayKey }) {
  const reduced = useReducedMotion() ?? false
  const { week, left, right } = results
  const a = week.scores[left.id]
  const b = week.scores[right.id]
  if (!a || !b) return null
  const finished = week.finished
  const leader = week.outcome.winnerId

  return (
    <Card className="px-3 py-3">
      {/* En-tête : les deux joueurs */}
      <div className={`${ROW} pb-2`}>
        <span />
        <PlayerHead player={left} />
        <PlayerHead player={right} />
      </div>

      <ul>
        {week.days.map((day, i) => {
          const future = day > today
          const isToday = day === today && !finished
          const da = a.days[i]
          const db = b.days[i]
          return (
            <li key={day} className={`${ROW} min-h-11 rounded-[16px] px-0 ${isToday ? 'bg-sunken' : ''}`}>
              <span className="pl-1.5 font-display text-[15px] leading-tight font-semibold text-ink-soft">
                {isToday ? 'Auj.' : capitalize(formatDay(day, 'EEE'))}
                <span className="block text-[13px] font-medium text-muted">{formatDay(day, 'd MMM')}</span>
              </span>
              {[
                { p: left, d: da, o: db },
                { p: right, d: db, o: da },
              ].map(({ p, d, o }) => (
                <Bar
                  key={p.id}
                  value={d.score}
                  max={RULES.week.dailyMax}
                  color={p.color}
                  best={!future && d.score > o.score}
                  star={d.perfect}
                  pending={future}
                  delay={reduced ? 0 : 0.05 + i * 0.05}
                />
              ))}
            </li>
          )
        })}

        {/* Pesée */}
        <li className={`${ROW} mt-1 min-h-12 border-t-2 border-dashed border-line pt-2`}>
          <span className="pl-1.5 font-display text-[15px] leading-tight font-semibold text-ink-soft">
            ⚖️ Pesée
            <span className="block text-[13px] font-medium text-muted">max {RULES.weighIn.maxPoints}</span>
          </span>
          {[
            { p: left, s: a, o: b },
            { p: right, s: b, o: a },
          ].map(({ p, s, o }) => (
            <div key={p.id} className="min-w-0">
              <Bar
                value={s.weighInPoints}
                max={RULES.weighIn.maxPoints}
                color={p.color}
                best={s.weighInPoints > o.weighInPoints}
                star={false}
                pending={!s.weighIn && !finished}
                delay={reduced ? 0 : 0.45}
              />
              <p className="mt-0.5 truncate text-[13px] font-semibold text-muted">{weighCaption(s, finished)}</p>
            </div>
          ))}
        </li>

        {/* Total */}
        <li className={`${ROW} mt-2 min-h-14 rounded-[18px] bg-sunken py-2`}>
          <span className="pl-1.5 font-display text-[17px] font-bold text-ink">Total</span>
          {[
            { p: left, s: a },
            { p: right, s: b },
          ].map(({ p, s }) => (
            <span key={p.id} className="flex items-baseline gap-1">
              <span className="score-num text-[28px] leading-none" style={{ color: deep(p.color, 80) }}>
                {s.total}
              </span>
              <span className="font-display text-[13px] font-semibold text-muted">pts</span>
              {leader === p.id && (
                <span className="ml-0.5 text-[20px] leading-none" aria-label={finished ? 'Gagnant' : 'En tête'} role="img">
                  <span className={finished ? '' : 'opacity-60'}>👑</span>
                </span>
              )}
            </span>
          ))}
        </li>
      </ul>

      <p className="mt-2 px-1 text-[13px] font-semibold text-muted">
        ⭐ = journée parfaite · {RULES.week.days} jours × {RULES.week.dailyMax} + pesée {RULES.weighIn.maxPoints} = {RULES.week.days * RULES.week.dailyMax + RULES.weighIn.maxPoints} max
      </p>
    </Card>
  )
}

function weighCaption(s: PlayerWeekScore, finished: boolean): string {
  if (!s.weighIn) return finished ? 'pas de pesée' : 'pas encore'
  if (s.weighIn.changePct === null) return '📍 départ'
  return formatPct(s.weighIn.changePct)
}

function PlayerHead({ player }: { player: Player }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Avatar player={player} size="xs" />
      <span className="truncate font-display text-[15px] font-semibold" style={{ color: deep(player.color, 72) }}>
        {player.name}
      </span>
    </div>
  )
}

function Bar({
  value,
  max,
  color,
  best,
  star,
  pending,
  delay,
}: {
  value: number
  max: number
  color: string
  best: boolean
  star: boolean
  pending: boolean
  delay: number
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: tint(color, 12) }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ ...softSpring, delay }}
        />
      </div>
      <span
        className={`score-num w-8 shrink-0 text-right text-[16px] ${best ? '' : 'opacity-70'}`}
        style={{ color: pending ? 'var(--color-muted)' : best ? deep(color, 80) : 'var(--color-ink-soft)' }}
      >
        {pending ? '—' : value}
      </span>
      <span className="w-4 shrink-0 text-[13px] leading-none" aria-label={star ? 'Journée parfaite' : undefined} role={star ? 'img' : undefined}>
        {star ? '⭐' : ''}
      </span>
    </div>
  )
}
