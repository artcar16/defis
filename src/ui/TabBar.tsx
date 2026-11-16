/**
 * Barre d'onglets du bas : Ring, Check-in, Stats, Badges, Réglages.
 */
import { motion } from 'motion/react'
import { useDuel } from '../data/DuelProvider'
import { TABS, useNav } from './nav'

export function TabBar() {
  const { tab, setTab } = useNav()
  const { season, me, snapshot, today } = useDuel()
  // Pastille sur Check-in tant que le check-in du jour n'est pas complet.
  const todayDone = season.current.scores[me.id]?.days.find((d) => d.day === today)?.complete ?? true
  const pendingForMe = snapshot.proposals.filter((p) => p.status === 'pending' && p.authorId !== me.id).length

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 px-3" aria-label="Navigation principale">
      <div className="mx-auto flex max-w-md items-stretch justify-between rounded-[28px] bg-surface/95 p-1.5 shadow-[var(--shadow-pop)] backdrop-blur">
        {TABS.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px]"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-[22px]"
                  style={{ background: 'color-mix(in oklab, var(--me) 16%, transparent)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                />
              )}
              <motion.span
                className="relative text-[26px] leading-none"
                animate={{ scale: active ? 1.15 : 1, y: active ? -1 : 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              >
                {t.emoji}
              </motion.span>
              <span
                className={`relative font-display text-[11px] font-semibold ${active ? 'text-ink' : 'text-muted'}`}
              >
                {t.label}
              </span>
              {t.id === 'checkin' && !todayDone && (
                <span className="absolute top-1.5 right-4 size-3 rounded-full bg-craquage ring-2 ring-surface" aria-label="Check-in à faire" />
              )}
              {t.id === 'settings' && pendingForMe > 0 && (
                <span className="absolute top-1 right-3 grid size-5 place-items-center rounded-full bg-craquage text-[11px] font-bold text-white">
                  {pendingForMe}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
