/**
 * Sous les cartes : la pesée de la semaine (« ⚖️ Pesée : dimanche ») et les habitudes
 * qui arrivent lundi prochain (changements de règles acceptés à deux).
 */
import { motion, useReducedMotion } from 'motion/react'
import { diffDays } from '../../core/dates'
import type { Habit, Player } from '../../core/types'
import { springy } from '../../ui/kit'
import { KIND_LABELS, dayMonth, inkOf, plural, tint, weekdayName } from './format'
import type { WeighInInfo } from './useCheckin'

/** La pesée de la semaine : bouton le jour J, sinon simple rappel. */
export function WeighInRow({
  me,
  info,
  today,
  onOpen,
}: {
  me: Player
  info: WeighInInfo
  today: string
  onOpen: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const done = info.mine !== null
  const dayLabel = info.isToday ? 'aujourd’hui !' : weekdayName(info.date)

  let status: { text: string; color: string | null }
  if (done) status = { text: 'faite ✅', color: 'var(--color-nickel)' }
  else if (info.isToday) status = { text: 'Go ⚖️', color: me.color }
  else if (info.past) status = { text: 'ratée 😶', color: null }
  else status = { text: `dans ${plural(diffDays(today, info.date), 'jour')}`, color: null }

  const content = (
    <>
      <motion.span
        className="text-[34px] leading-none"
        animate={info.isToday && !done && !reduced ? { rotate: [0, -10, 10, -6, 0] } : undefined}
        transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 2.2 }}
        aria-hidden="true"
      >
        ⚖️
      </motion.span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-display text-[18px] leading-tight font-semibold text-ink">Pesée : {dayLabel}</span>
        <span className="block text-[15px] leading-snug font-semibold text-muted">
          {info.isToday
            ? done
              ? 'Tape pour corriger jusqu’à minuit'
              : 'Le jour J ! Jusqu’à 100 pts en jeu'
            : done
              ? 'C’est dans la boîte pour cette manche'
              : info.past
                ? 'Pas de pesée cette semaine = 0 pt'
                : `Le ${dayMonth(info.date)} · jusqu’à 100 pts`}
        </span>
      </span>
      <span
        className="shrink-0 rounded-full px-3 py-1 font-display text-[15px] font-bold whitespace-nowrap"
        style={
          status.color
            ? { background: tint(status.color, 18, 'transparent'), color: inkOf(status.color, 78) }
            : { background: 'var(--color-sunken)', color: 'var(--color-muted)' }
        }
      >
        {status.text}
      </span>
    </>
  )

  const className = 'card flex min-h-16 w-full items-center gap-3 px-4 py-3'
  if (!info.isToday) return <div className={className}>{content}</div>
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      transition={springy}
      className={className}
      style={done ? undefined : { boxShadow: `inset 0 0 0 3px ${tint(me.color, 55, 'transparent')}, var(--shadow-card)` }}
      aria-label={done ? 'Pesée faite, corriger ma pesée' : 'C’est le jour de la pesée : me peser'}
    >
      {content}
    </motion.button>
  )
}

/** Habitudes qui commencent plus tard (lundi prochain) : petite liste discrète. */
export function UpcomingHabits({ habits }: { habits: Habit[] }) {
  if (habits.length === 0) return null
  return (
    <section className="rounded-[var(--radius-card)] border-2 border-dashed border-line px-4 py-3">
      <h2 className="font-display text-[16px] font-semibold text-muted">
        🗓️ Dès lundi <span className="font-body text-[14px]">· {dayMonth(habits[0].activeFrom)}</span>
      </h2>
      <ul className="mt-1.5 space-y-1.5">
        {habits.map((h) => (
          <li key={h.id} className="flex items-center gap-2.5 text-[15px] font-semibold text-muted">
            <span className="text-[22px] leading-none opacity-70 grayscale-[0.4]" aria-hidden="true">
              {h.emoji}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-soft">{h.name}</span>
            <span className="shrink-0 text-[14px]">{KIND_LABELS[h.kind]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
