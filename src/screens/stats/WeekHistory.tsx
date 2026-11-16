/**
 * 📜 Historique des manches terminées (la plus récente en premier) : totaux,
 * gagnant 👑 ou égalité 🤝, enjeu et gage payé ✅ / 🫣. Toucher une manche
 * ouvre ses résultats.
 */
import { motion, useReducedMotion } from 'motion/react'
import type { WeekView } from '../../core/season'
import type { Player, PlayerId } from '../../core/types'
import { Avatar, Card, springy } from '../../ui/kit'
import { deep, plural, shortDay, tint } from './format'

function ScoreBar({ player, total, max, winner, delay }: { player: Player; total: number; max: number; winner: boolean; delay: number }) {
  const reduced = useReducedMotion() ?? false
  const pct = max > 0 ? Math.max(4, (total / max) * 100) : 4
  return (
    <div className="flex items-center gap-2">
      <Avatar player={player} size="xs" />
      <div className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken">
        <motion.div
          className="h-full rounded-full"
          style={{ background: winner ? player.color : `color-mix(in oklab, ${player.color} 62%, var(--color-sunken))` }}
          initial={reduced ? false : { width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 140, damping: 20, delay }}
        />
      </div>
      <span className={`score-num w-11 text-right text-[18px] leading-none ${winner ? 'text-ink' : 'text-ink-soft'}`}>{total}</span>
      <span className="w-6 text-center text-[18px] leading-none" aria-hidden="true">
        {winner ? '👑' : ''}
      </span>
    </div>
  )
}

function gageLine(week: WeekView, me: Player, playerById: (id: PlayerId) => Player): { emoji: string; text: string; done: boolean }[] {
  const owed = week.outcome.gageFor
  const paid = week.meta?.gagePaid ?? {}
  return owed.map((id) => {
    const p = playerById(id)
    const isMe = id === me.id
    if (paid[id]) return { emoji: '✅', text: isMe ? 'Ton gage est payé' : `${p.name} a payé son gage`, done: true }
    return {
      emoji: '🫣',
      text: isMe ? 'Tu dois encore ton gage…' : `${p.name} te doit encore son gage`,
      done: false,
    }
  })
}

function WeekRow({
  week,
  me,
  other,
  playerById,
  onOpen,
}: {
  week: WeekView
  me: Player
  other: Player
  playerById: (id: PlayerId) => Player
  onOpen: () => void
}) {
  const { outcome } = week
  const winner = outcome.winnerId ? playerById(outcome.winnerId) : null
  const mine = week.scores[me.id]?.total ?? 0
  const theirs = week.scores[other.id]?.total ?? 0
  const max = Math.max(mine, theirs)
  const gages = gageLine(week, me, playerById)
  const accent = winner?.color ?? 'var(--color-gold)'

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.97 }}
      transition={springy}
      className="card block w-full overflow-hidden px-4 pt-3 pb-3 text-left"
      style={{ boxShadow: `inset 4px 0 0 ${accent}, var(--shadow-card)` }}
      aria-label={`Manche ${week.index}, semaine du ${shortDay(week.weekStart)} : ${
        winner ? `${winner.name} gagne` : 'égalité'
      }, ${me.name} ${mine}, ${other.name} ${theirs}. Voir les résultats`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[12px] font-semibold tracking-wide text-muted uppercase">Manche {week.index}</p>
          <p className="font-display text-[18px] leading-tight font-semibold text-ink">Semaine du {shortDay(week.weekStart)}</p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 font-display text-[14px] font-semibold"
          style={
            winner
              ? { background: tint(winner.color, 18), color: deep(winner.color, 72) }
              : { background: 'color-mix(in oklab, var(--color-gold) 24%, var(--color-surface))', color: 'var(--color-ink)' }
          }
        >
          {winner ? (
            <>
              👑 {winner.id === me.id ? 'Toi' : winner.name}
              <span className="score-num text-[13px] opacity-80">+{outcome.gap}</span>
            </>
          ) : (
            '🤝 Égalité'
          )}
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        <ScoreBar player={me} total={mine} max={max} winner={outcome.winnerId === me.id || outcome.tie} delay={0.1} />
        <ScoreBar player={other} total={theirs} max={max} winner={outcome.winnerId === other.id || outcome.tie} delay={0.18} />
      </div>

      <div className="mt-3 flex items-end justify-between gap-2 border-t-2 border-dashed border-line pt-2.5">
        <div className="min-w-0 space-y-1 text-[15px] leading-snug">
          <p className="font-semibold text-ink-soft">
            <span aria-hidden="true">🎯 </span>
            {week.meta?.stake ?? 'Pas d’enjeu cette fois'}
          </p>
          {gages.map((g, i) => (
            <p key={i} className={`font-bold ${g.done ? 'text-ink-soft' : 'text-ink'}`}>
              <span aria-hidden="true">{g.emoji} </span>
              {g.text}
            </p>
          ))}
        </div>
        <span className="shrink-0 font-display text-[28px] leading-none text-muted" aria-hidden="true">
          ›
        </span>
      </div>
    </motion.button>
  )
}

export function WeekHistory({
  finished,
  current,
  me,
  other,
  playerById,
  onOpen,
  onCurrent,
}: {
  finished: WeekView[]
  current: WeekView | null
  me: Player
  other: Player
  playerById: (id: PlayerId) => Player
  onOpen: (weekStart: string) => void
  onCurrent: () => void
}) {
  const list = [...finished].reverse()
  return (
    <div className="space-y-3">
      {current && !current.finished && (
        <motion.button
          type="button"
          onClick={onCurrent}
          whileTap={{ scale: 0.97 }}
          transition={springy}
          className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-line px-4 py-2.5 text-left"
        >
          <span className="text-[28px] leading-none" aria-hidden="true">
            🥊
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] font-semibold text-ink">Manche {current.index} en cours</span>
            <span className="block text-[14px] font-semibold text-muted">
              {current.daysLeft > 0 ? `Encore ${plural(current.daysLeft, 'jour')} pour écrire l'histoire ✍️` : 'Ça commence bientôt ⏳'}
            </span>
          </span>
          <span className="font-display text-[28px] leading-none text-muted" aria-hidden="true">
            ›
          </span>
        </motion.button>
      )}

      {list.length === 0 ? (
        <Card className="flex flex-col items-center px-4 py-6 text-center">
          <span className="emoji-xl" aria-hidden="true">
            📜
          </span>
          <p className="mt-2 font-display text-[18px] font-semibold text-ink">Aucune manche terminée</p>
          <p className="mt-1 text-[15px] text-ink-soft">Le premier verdict tombe lundi. Que le meilleur gagne 👑</p>
        </Card>
      ) : (
        list.map((w) => (
          <WeekRow key={w.weekStart} week={w} me={me} other={other} playerById={playerById} onOpen={() => onOpen(w.weekStart)} />
        ))
      )}
    </div>
  )
}
