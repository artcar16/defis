/**
 * Cartes d'info de la pesée : mon objectif, la dernière pesée de l'autre,
 * l'historique de mes pesées. On parle de % et de points, jamais du corps.
 */
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { RULES } from '../../config/rules'
import { formatPts, formatSignedPts, NBSP } from '../../core/fr'
import { weighInPoints } from '../../core/scoring'
import type { DayKey, Player, WeighIn } from '../../core/types'
import { formatKg, formatPct } from '../../core/weight'
import { deep, tint } from '../../ui/color'
import { Avatar, Card, Pill, ProgressBar, SectionTitle } from '../../ui/kit'
import { frNum, shortDay } from './format'

// ─── Mon objectif ────────────────────────────────────────────────────────────

export function GoalCard({ me, fromStartPct, hasStart }: { me: Player; fromStartPct: number | null; hasStart: boolean }) {
  const goalPct = me.goalFromStartPct
  // Part du chemin parcouru vers l'objectif (même sens que l'objectif).
  const progress =
    goalPct !== null && goalPct !== 0 && fromStartPct !== null ? Math.max(0, Math.min(1, fromStartPct / goalPct)) : null

  return (
    <Card className="mt-4">
      <div className="flex items-center gap-3">
        <span className="emoji-xl text-[40px]" aria-hidden="true">
          🎯
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight font-semibold text-ink">Mon objectif</p>
          <p className="text-[15px] font-semibold text-muted">
            {me.goalKg !== null || goalPct !== null
              ? [me.goalKg !== null ? formatKg(me.goalKg) : null, goalPct !== null ? `${formatPct(goalPct)} depuis le départ` : null]
                  .filter(Boolean)
                  .join(' · ')
              : 'Pas encore d’objectif'}
          </p>
        </div>
      </div>

      {progress !== null && hasStart ? (
        <>
          <ProgressBar value={progress * 100} max={100} color={me.color} className="mt-3 h-4!" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[15px] font-bold">
            <span className="whitespace-nowrap text-ink-soft">
              Depuis le départ{NBSP}: {formatPct(fromStartPct)}
            </span>
            <span className="whitespace-nowrap" style={{ color: deep(me.color, 82) }}>
              {Math.round(progress * 100)}
              {NBSP}% du chemin
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[15px] text-ink-soft">
          {!hasStart
            ? 'Ta première pesée servira de point de départ 📍'
            : 'Tu peux proposer un objectif dans les Réglages ⚙️ (l’autre doit l’accepter).'}
        </p>
      )}
      <p className="mt-2 text-[13px] font-semibold text-muted">
        {`Une fois dans la zone (±${frNum(RULES.weighIn.goalTolerancePct)}${NBSP}%), chaque pesée rapporte ${formatPts(RULES.weighIn.maxPoints)} 🎯`}
      </p>
    </Card>
  )
}

// ─── L'autre ─────────────────────────────────────────────────────────────────

export function OpponentCard({ other, latest, today, open }: { other: Player; latest: WeighIn | null; today: DayKey; open: boolean }) {
  const points = weighInPoints(latest)
  const isToday = latest?.day === today
  return (
    <Card className="mt-4">
      <div className="flex items-center gap-3">
        <Avatar player={other} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg leading-tight font-semibold" style={{ color: deep(other.color, 75) }}>
            {other.name}
          </p>
          {/* Le statut sous le prénom ; la date complète, plus longue, passe sous l'en-tête. */}
          <p className="text-[15px] font-semibold text-muted">{latest ? (isToday ? 'Pesée du jour' : 'Dernière pesée') : 'Pas encore de pesée'}</p>
        </div>
        {latest && (
          <div className="shrink-0 text-right">
            {/* 2 décimales à côté des points (−0,46 % = 46 pts) : ce qu'on voit = ce qui compte. */}
            <p className="score-num text-[clamp(20px,6.5vw,26px)] leading-none whitespace-nowrap" style={{ color: deep(other.color, 80) }}>
              {latest.changePct === null ? '📍' : formatPct(latest.changePct, 2)}
            </p>
            <p className="mt-1 text-[13px] font-bold text-muted">{latest.changePct === null ? 'départ' : formatPts(points)}</p>
          </div>
        )}
      </div>
      {latest && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!isToday && <Pill>📅 {shortDay(latest.day, true)}</Pill>}
          <Pill color={other.color}>
            Depuis le départ{NBSP}: {formatPct(latest.fromStartPct)}
          </Pill>
          {latest.weightKg !== null && <Pill color={other.color}>{formatKg(latest.weightKg)}</Pill>}
          {open && (isToday ? <Pill color="var(--color-nickel)">✅ Déjà passé·e sur la balance</Pill> : <Pill>👀 Pas encore pesé·e</Pill>)}
        </div>
      )}
      {latest?.weightKg === null && (
        <p className="mt-2 text-[13px] font-semibold text-muted">🔒 Tu ne vois que ses variations en{NBSP}%, pas ses kilos.</p>
      )}
    </Card>
  )
}

// ─── Mon historique ──────────────────────────────────────────────────────────

const VISIBLE = 6

export function WeighInHistory({ me, mine }: { me: Player; mine: WeighIn[] }) {
  const reduced = useReducedMotion() ?? false
  const [all, setAll] = useState(false)
  if (mine.length === 0) return null
  const rows = [...mine].reverse()
  const shown = all ? rows : rows.slice(0, VISIBLE)

  return (
    <>
      <SectionTitle>📜 Mes pesées</SectionTitle>
      <Card className="p-2">
        <ul>
          {shown.map((w, i) => {
            const pts = weighInPoints(w)
            const first = w.changePct === null
            return (
              <motion.li
                key={w.day}
                className="flex min-h-12 items-center gap-2 rounded-[18px] px-3 py-2 odd:bg-sunken"
                initial={reduced ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.04 }}
              >
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block font-display text-[15px] font-semibold whitespace-nowrap text-ink-soft">{shortDay(w.day, true)}</span>
                  {w.weightKg !== null && <span className="score-num block text-[15px] text-ink">{formatKg(w.weightKg)}</span>}
                </span>
                {first ? (
                  // La toute première pesée : le point de départ, sans variation ni points.
                  <span className="shrink-0 text-[15px] font-bold whitespace-nowrap text-ink-soft">📍 Point de départ</span>
                ) : (
                  <>
                    {/* 2 décimales à côté des points (−0,46 % = 46 pts). */}
                    <span className="shrink-0 text-right text-[15px] font-bold whitespace-nowrap text-ink-soft">{formatPct(w.changePct, 2)}</span>
                    <span
                      className="w-[70px] shrink-0 rounded-full py-1 text-center text-[13px] font-bold whitespace-nowrap"
                      style={
                        pts > 0
                          ? { background: tint('var(--color-nickel)', 22), color: deep('var(--color-nickel)', 65) }
                          : { background: 'color-mix(in oklab, var(--color-ink) 7%, transparent)', color: 'var(--color-muted)' }
                      }
                    >
                      {formatSignedPts(pts)}
                    </span>
                  </>
                )}
              </motion.li>
            )
          })}
        </ul>
        {rows.length > VISIBLE && (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="mt-1 min-h-12 w-full rounded-[18px] font-display text-[15px] font-semibold"
            style={{ color: deep(me.color, 82) }}
          >
            {all ? 'Voir moins ▴' : `Voir les ${rows.length} pesées ▾`}
          </button>
        )}
      </Card>
    </>
  )
}
