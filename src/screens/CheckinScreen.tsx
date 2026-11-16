/**
 * ✅ Check-in du jour : une carte par habitude, un tap = enregistré.
 * Le score du jour monte en direct, confettis quand la journée devient parfaite,
 * bascule « Aujourd'hui / Hier » pour rattraper un oubli (pas le lundi : manche close).
 * Objectif : moins de 15 secondes. Ne lit les données que via useDuel().
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NBSP, frDate, frDayMonth, plural } from '../core/fr'
import { pointsFor } from '../core/scoring'
import type { CheckinValue } from '../core/types'
import { useDuel } from '../data/DuelProvider'
import { themeColor } from '../ui/color'
import { celebrate } from '../ui/confetti'
import { Avatar, Button, ScreenHeader, springy } from '../ui/kit'
import { useNav } from '../ui/nav'
import { useToast } from '../ui/toast'
import { DayToggle } from './checkin/DayToggle'
import { DoneCard, type DoneAction } from './checkin/DoneCard'
import { UpcomingHabits, WeighInRow } from './checkin/Extras'
import { HabitCard } from './checkin/HabitCard'
import { ScoreGauge } from './checkin/ScoreGauge'
import { useCheckin, type CheckinView, type DayChoice } from './checkin/useCheckin'

/** Zone visible au-dessus de la barre d'onglets / sous le mini-score flottant (px). */
const VISIBLE_TOP = 84
const VISIBLE_BOTTOM = 124

/** Fait défiler doucement pour que l'élément soit entièrement visible (s'il ne l'est pas déjà). */
function reveal(el: HTMLElement | null | undefined, smooth: boolean) {
  if (!el) return
  const rect = el.getBoundingClientRect()
  const bottom = window.innerHeight - VISIBLE_BOTTOM
  if (rect.top >= VISIBLE_TOP && rect.bottom <= bottom) return
  const room = bottom - VISIBLE_TOP
  const offset = rect.height < room ? VISIBLE_TOP + (room - rect.height) / 2 : VISIBLE_TOP
  window.scrollTo({ top: window.scrollY + rect.top - offset, behavior: smooth ? 'smooth' : 'auto' })
}

export function CheckinScreen() {
  const { me, other } = useDuel()
  const { setTab, openSheet, takeCheckinDay } = useNav()
  const toast = useToast()
  const reduced = useReducedMotion() ?? false

  // Jour demandé par le lien qui a ouvert l'onglet (« Hier n'est pas complet » du Ring), lu une fois.
  const [requested, setRequested] = useState<DayChoice>(() => takeCheckinDay() ?? 'today')
  const onError = useCallback((text: string) => toast({ text, color: 'var(--color-craquage)' }), [toast])
  const { view, answer } = useCheckin(requested, onError)

  const cardRefs = useRef(new Map<string, HTMLElement>())
  const doneRef = useRef<HTMLElement>(null)
  const scrollTimer = useRef<number | undefined>(undefined)
  const [celebrateKey, setCelebrateKey] = useState(0)

  useEffect(() => () => window.clearTimeout(scrollTimer.current), [])

  const onAnswer = (habitId: string, value: CheckinValue) => {
    const rows = view.rows
    const index = rows.findIndex((r) => r.habit.id === habitId)
    const wasEmpty = rows[index]?.value === null

    // Confettis quand ce tap rend la journée parfaite (la transition seulement, jamais au chargement).
    const willBePerfect =
      rows.length > 0 && rows.every((r) => pointsFor(r.habit.kind, r.habit.id === habitId ? value : r.value) === r.max)
    if (willBePerfect && !view.score.perfect) {
      celebrate([me.color, themeColor('gold', '#ffc23d'), themeColor('nickel', '#22c55e')])
      setCelebrateKey((k) => k + 1)
      try {
        navigator.vibrate?.([25, 40, 25])
      } catch {
        // pas de vibreur : tant pis
      }
    }

    void answer(habitId, value)

    // Puis on descend gentiment vers la prochaine habitude vide (ou vers « Check-in bouclé »).
    if (wasEmpty) {
      const next = [...rows.slice(index + 1), ...rows.slice(0, index)].find((r) => r.value === null)
      window.clearTimeout(scrollTimer.current)
      scrollTimer.current = window.setTimeout(
        () => reveal(next ? cardRefs.current.get(next.habit.id) : doneRef.current, !reduced),
        next ? 380 : 520,
      )
    }
  }

  const switchDay = (c: DayChoice) => {
    if (c === view.choice) return
    setRequested(c)
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }

  const isToday = view.choice === 'today'

  return (
    <div>
      <ScreenHeader
        title="Check-in"
        subtitle={
          <>
            {frDate(view.day, { capitalized: true })}
            {!isToday && <span className="text-ink-soft"> · rattrapage ⏪</span>}
          </>
        }
        right={<Avatar player={me} size="sm" className="mb-1.5" />}
      />

      <div className="space-y-4">
        <DayToggle
          choice={view.choice}
          onChange={switchDay}
          lockReason={view.yesterday.lockReason}
          missingYesterday={view.yesterday.missing}
        />

        {view.notStarted ? (
          <NotStarted view={view} />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view.day}
              className="space-y-4"
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: isToday ? 28 : -28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: isToday ? -28 : 28 }}
              transition={{ duration: 0.18 }}
            >
              <ScoreGauge me={me} score={view.score} rows={view.rows} line={view.line} celebrateKey={celebrateKey} />

              {view.rows.length === 0 ? (
                <NoHabits onSettings={() => setTab('settings')} />
              ) : (
                view.rows.map((row, i) => (
                  <HabitCard
                    key={row.habit.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(row.habit.id, el)
                      else cardRefs.current.delete(row.habit.id)
                    }}
                    row={row}
                    index={i}
                    editable={view.editable}
                    onAnswer={(v) => onAnswer(row.habit.id, v)}
                  />
                ))
              )}

              <AnimatePresence initial={false}>
                {view.score.complete && (
                  <DoneCard
                    key="done"
                    ref={doneRef}
                    me={me}
                    other={other}
                    score={view.score}
                    otherScore={view.otherScore}
                    isToday={isToday}
                    {...doneActions(view, {
                      ring: () => setTab('ring'),
                      weighIn: () => openSheet({ kind: 'weighin' }),
                      today: () => switchDay('today'),
                      yesterday: () => switchDay('yesterday'),
                    })}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        )}

        <WeighInRow me={me} info={view.weighIn} today={view.today} onOpen={() => openSheet({ kind: 'weighin' })} />
        {!view.notStarted && <UpcomingHabits habits={view.upcoming} />}
      </div>
    </div>
  )
}

/** La suite logique une fois le check-in bouclé. */
function doneActions(
  view: CheckinView,
  go: { ring: () => void; weighIn: () => void; today: () => void; yesterday: () => void },
): { primary: DoneAction; secondary?: DoneAction } {
  // Espace insécable avant l'emoji final : il ne se retrouve jamais seul sur une ligne.
  const ring: DoneAction = { label: `Retour au Ring${NBSP}🥊`, onClick: go.ring }
  if (view.choice === 'yesterday') {
    return view.todayScore.complete
      ? { primary: ring }
      : { primary: { label: `Passer à aujourd’hui${NBSP}☀️`, onClick: go.today }, secondary: ring }
  }
  if (view.weighIn.isToday && !view.weighIn.mine) {
    return { primary: { label: `Et maintenant, la pesée${NBSP}⚖️`, onClick: go.weighIn }, secondary: ring }
  }
  if (view.yesterday.missing > 0) {
    return {
      primary: ring,
      secondary: { label: `Rattraper hier${NBSP}⏪ (${plural(view.yesterday.missing, 'oubli')})`, onClick: go.yesterday },
    }
  }
  return { primary: ring }
}

/** Avant le premier lundi du duel : on montre ce qui arrive, sans pouvoir remplir. */
function NotStarted({ view }: { view: CheckinView }) {
  const reduced = useReducedMotion() ?? false
  const habits = view.upcoming
  return (
    <motion.section
      className="card px-5 py-6 text-center"
      initial={reduced ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springy}
    >
      <motion.div
        className="emoji-xl text-[72px]!"
        animate={reduced ? undefined : { rotate: [0, -8, 8, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
        aria-hidden="true"
      >
        ⏳
      </motion.div>
      <h2 className="mt-3 font-display text-[26px] leading-tight font-bold text-ink">Pas encore commencé{NBSP}!</h2>
      <p className="mt-1 text-[16px] font-semibold text-pretty text-ink-soft">
        {habits.length > 0 ? `Premier check-in le lundi ${frDayMonth(habits[0].activeFrom, 'MMMM')}.` : 'Premier check-in lundi.'} Échauffe-toi 🥊
      </p>
      {habits.length > 0 && (
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {habits.map((h) => (
            <li key={h.id} className="rounded-full bg-sunken px-3 py-1.5 font-display text-[16px] font-semibold text-ink-soft">
              {h.emoji} {h.name}
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  )
}

/** Aucune habitude active ce jour-là (toutes désactivées). */
function NoHabits({ onSettings }: { onSettings: () => void }) {
  return (
    <section className="card px-5 py-6 text-center">
      <div className="emoji-xl" aria-hidden="true">
        🤷
      </div>
      <h2 className="mt-2 font-display text-[22px] font-bold text-ink">Rien à cocher ce jour-là</h2>
      <p className="mt-1 text-[15px] font-semibold text-muted">Propose une habitude à l’autre dans les réglages.</p>
      <Button variant="soft" className="mt-4" onClick={onSettings}>
        ⚙️ Réglages
      </Button>
    </section>
  )
}
