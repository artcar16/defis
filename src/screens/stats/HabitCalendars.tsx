/**
 * 📅 Calendrier par habitude (5 dernières semaines, lundi → dimanche) avec la série
 * en cours 🔥 et le record 🏆. Moi par défaut, bascule vers l'adversaire.
 */
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import { addDays, ISO_DAY_SHORT, weekEndOf, weekStartOf } from '../../core/dates'
import type { CheckinIndex } from '../../core/scoring'
import { habitCalendar, habitStreak, type CalendarCell, type DayStatus } from '../../core/streaks'
import type { DayKey, Habit, Player } from '../../core/types'
import { Card, springy, VALUE_COLORS, VALUE_LABELS } from '../../ui/kit'
import { PlayerToggle } from './bits'
import { deep, mediumDay, plural, shortDay, tint } from './format'

/** Nombre de semaines affichées (au plus). */
const WEEKS_SHOWN = 5

function statusInfo(status: DayStatus, isToday = false): { emoji: string; label: string } {
  if (status in VALUE_LABELS) return VALUE_LABELS[status]
  if (status === 'empty' && isToday) return { emoji: '👀', label: 'Pas encore rempli aujourd’hui' }
  if (status === 'empty') return { emoji: '🫥', label: 'Oublié (pas rempli)' }
  if (status === 'future') return { emoji: '🔮', label: 'Pas encore joué' }
  return { emoji: '💤', label: 'Ne comptait pas' }
}

const isWin = (status: DayStatus) => status === 'nickel' || status === 'fait'

// ─── Une case ────────────────────────────────────────────────────────────────

function Cell({ cell, today, color, selected }: { cell: CalendarCell; today: DayKey; color: string; selected: boolean }) {
  const isToday = cell.day === today
  const value = cell.status in VALUE_COLORS ? cell.status : null
  const base = 'relative grid h-9 place-items-center rounded-[11px] text-[15px] leading-none transition-transform'
  let className = base
  const style: CSSProperties = {}
  if (value) {
    style.background = VALUE_COLORS[value]
    style.boxShadow = `inset 0 -3px 0 color-mix(in oklab, ${VALUE_COLORS[value]} 72%, black)`
  } else if (cell.status === 'empty') {
    className += ' bg-sunken'
    style.boxShadow = 'inset 0 0 0 2px var(--color-line)'
  } else {
    // inactif ou à venir : à peine visible
    className += ' bg-sunken opacity-45'
  }
  if (isToday) {
    style.outline = `3px solid ${color}`
    style.outlineOffset = '2px'
  }
  if (selected) style.transform = 'scale(1.12)'
  return (
    <div role="img" aria-label={`${mediumDay(cell.day)} : ${statusInfo(cell.status, isToday).label}`} data-day={cell.day} className={className} style={style}>
      {value ? (
        <span aria-hidden="true" className="drop-shadow-[0_1px_1px_rgb(0_0_0/0.18)]">
          {VALUE_LABELS[value].emoji}
        </span>
      ) : isToday ? (
        <span aria-hidden="true" className="text-[14px]">
          👀
        </span>
      ) : null}
    </div>
  )
}

// ─── Carte d'une habitude ───────────────────────────────────────────────────

interface HabitView {
  habit: Habit
  cells: CalendarCell[]
  current: number
  record: number
  ok: number
  counted: number
}

function StreakBadge({ emoji, value, label, hot, gold }: { emoji: string; value: number; label: string; hot?: boolean; gold?: boolean }) {
  const reduced = useReducedMotion() ?? false
  return (
    <div
      className="flex min-w-[58px] flex-col items-center rounded-2xl px-2 py-1.5"
      style={
        gold
          ? { background: 'color-mix(in oklab, var(--color-gold) 26%, var(--color-surface))', boxShadow: 'inset 0 0 0 2px var(--color-gold)' }
          : { background: 'var(--color-sunken)' }
      }
    >
      <div className="flex items-center gap-1">
        <motion.span
          className="text-[18px] leading-none"
          aria-hidden="true"
          animate={hot && !reduced ? { scale: [1, 1.25, 1], rotate: [0, -8, 6, 0] } : undefined}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.6 }}
        >
          {emoji}
        </motion.span>
        <span className="score-num text-[20px] leading-none text-ink">{value}</span>
      </div>
      <span className="mt-0.5 text-[11px] font-extrabold tracking-wide text-muted uppercase">{label}</span>
    </div>
  )
}

function HabitCalendarCard({ view, player, today, from }: { view: HabitView; player: Player; today: DayKey; from: DayKey }) {
  const [picked, setPicked] = useState<DayKey | null>(null)
  const { habit, cells, current, record, ok, counted } = view
  const pickedCell = picked ? cells.find((c) => c.day === picked) : null
  const startsLater = habit.activeFrom > today
  const isRecord = record > 0 && current === record

  const onGridClick = (e: MouseEvent<HTMLDivElement>) => {
    const day = (e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day
    if (day) setPicked((p) => (p === day ? null : day))
  }

  return (
    <Card className="px-3.5 pt-3.5 pb-3">
      <div className="flex items-center gap-3">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-[1.1rem] text-[34px] leading-none"
          style={{ background: tint(player.color, 16) }}
          aria-hidden="true"
        >
          {habit.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[19px] leading-tight font-semibold text-ink">{habit.name}</h3>
          <p className="truncate text-[14px] font-semibold text-muted" title={habit.hint || undefined}>
            {habit.kind === 'avoid' ? '🙅 À éviter' : '✊ À faire'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <StreakBadge emoji="🔥" value={current} label="série" hot={current >= 3} />
          <StreakBadge emoji="🏆" value={record} label="record" gold={isRecord} />
        </div>
      </div>

      {startsLater ? (
        <p className="mt-3 rounded-2xl bg-sunken px-3 py-2.5 text-center text-[15px] font-semibold text-ink-soft">
          🆕 Nouvelle habitude : elle compte à partir du {mediumDay(habit.activeFrom)}
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-7 gap-1.5 px-0.5" aria-hidden="true">
            {ISO_DAY_SHORT.map((d, i) => (
              <span key={i} className="text-center font-display text-[13px] font-semibold text-muted">
                {d}
              </span>
            ))}
          </div>
          <div
            className="mt-1 grid grid-cols-7 gap-1.5 px-0.5"
            role="group"
            aria-label={`Calendrier ${habit.name} depuis le ${mediumDay(from)}`}
            onClick={onGridClick}
          >
            {cells.map((c) => (
              <Cell key={c.day} cell={c} today={today} color={player.color} selected={c.day === picked} />
            ))}
          </div>

          <div className="mt-2.5 flex min-h-6 items-center justify-between gap-2 px-1 text-[14px] font-semibold">
            {pickedCell ? (
              <motion.span key={pickedCell.day} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={springy} className="text-ink">
                {mediumDay(pickedCell.day)} · {statusInfo(pickedCell.status, pickedCell.day === today).emoji}{' '}
                {statusInfo(pickedCell.status, pickedCell.day === today).label}
              </motion.span>
            ) : (
              <span className="text-muted">
                {counted > 0 ? (
                  <>
                    <span className="text-ink-soft">{plural(ok, 'jour')} réussi{ok > 1 ? 's' : ''}</span> sur {counted}
                  </>
                ) : (
                  'Rien à juger pour l’instant 🤷'
                )}
              </span>
            )}
            {isRecord && current >= 3 && !pickedCell && (
              <span className="shrink-0 font-display font-semibold" style={{ color: deep('var(--color-gold-dark)', 85) }}>
                Record en cours ! 🏆
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

// ─── Section complète ────────────────────────────────────────────────────────

export function HabitCalendars({
  me,
  other,
  habits,
  checkins,
  today,
  seasonStart,
}: {
  me: Player
  other: Player
  habits: Habit[]
  checkins: CheckinIndex
  today: DayKey
  seasonStart: DayKey
}) {
  const [who, setWho] = useState<string>(me.id)
  const player = who === other.id ? other : me

  const thisWeek = weekStartOf(today)
  const from = useMemo(() => {
    const earliest = addDays(thisWeek, -7 * (WEEKS_SHOWN - 1))
    const first = weekStartOf(seasonStart)
    return first > earliest && first <= thisWeek ? first : earliest
  }, [thisWeek, seasonStart])
  const to = weekEndOf(thisWeek)

  const views = useMemo<HabitView[]>(
    () =>
      habits
        // Les habitudes visibles sur la période, plus celles qui démarrent lundi prochain (🆕).
        .filter((h) => h.playerId === player.id && h.activeFrom <= addDays(to, 1) && (h.activeUntil === null || h.activeUntil > from))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((habit) => {
          const cells = habitCalendar(habit, checkins, from, to, today)
          const { current, record } = habitStreak(habit, checkins, today)
          const judged = cells.filter((c) => c.status !== 'future' && c.status !== 'inactive' && !(c.day === today && c.status === 'empty'))
          return {
            habit,
            cells,
            current,
            record,
            ok: judged.filter((c) => isWin(c.status)).length,
            counted: judged.length,
          }
        }),
    [habits, checkins, player.id, from, to, today],
  )

  return (
    <div className="space-y-3">
      <PlayerToggle
        label="Calendrier de qui ?"
        value={player.id}
        onChange={setWho}
        options={[
          { id: me.id, label: 'Moi', player: me },
          { id: other.id, label: other.name, player: other },
        ]}
      />

      <Legend />

      {views.length === 0 ? (
        <Card className="flex flex-col items-center py-6 text-center">
          <span className="emoji-xl" aria-hidden="true">
            🤷
          </span>
          <p className="mt-2 font-display text-[17px] font-semibold">Aucune habitude à afficher</p>
        </Card>
      ) : (
        views.map((v, i) => (
          <motion.div
            key={`${player.id}-${v.habit.id}`}
            initial={{ opacity: 0, x: who === me.id ? -16 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...springy, delay: i * 0.05 }}
          >
            <HabitCalendarCard view={v} player={player} today={today} from={from} />
          </motion.div>
        ))
      )}
      <p className="px-2 text-center text-[13px] font-semibold text-muted">
        {shortDay(from)} → {shortDay(to)} · touche une case pour le détail 👆
      </p>
    </div>
  )
}

function Legend() {
  const items: { color: string; label: string; outline?: boolean }[] = [
    { color: 'var(--color-nickel)', label: 'Réussi' },
    { color: 'var(--color-unpeu)', label: 'Un peu' },
    { color: 'var(--color-craquage)', label: 'Raté' },
    { color: 'var(--color-sunken)', label: 'Oublié', outline: true },
  ]
  return (
    <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1 text-[14px] font-bold text-ink-soft">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="size-3.5 rounded-[5px]"
            style={{ background: it.color, boxShadow: it.outline ? 'inset 0 0 0 2px var(--color-line)' : undefined }}
            aria-hidden="true"
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}
