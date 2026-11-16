/**
 * 🏁 La course au poids : l'évolution de chacun en % depuis sa première pesée,
 * sur le même graphique. Jamais les kilos de l'autre (uniquement WeighIn.fromStartPct).
 */
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotItemDotProps,
  type TooltipContentProps,
} from 'recharts'
import { frDate, frDayMonth, NBSP } from '../../core/fr'
import type { DayKey, Player, PlayerId, WeighIn } from '../../core/types'
import { formatPct, weighInsOf } from '../../core/weight'
import { deep, tint } from '../../ui/color'
import { Avatar, Card, springy } from '../../ui/kit'
import { axisPct } from './format'

/** Une pesée sur l'axe du temps : % depuis le départ de chaque joueur pesé ce jour-là. */
interface Row {
  day: DayKey
  pct: Partial<Record<PlayerId, number>>
}

/** « dim. 1er nov. » */
const weighDay = (day: DayKey) => frDate(day, { weekday: 'EEE', month: 'MMM' })

/** Graduation de l'axe du temps : « 25 oct. », « 1er nov. ». */
const tickDay = (day: DayKey) => frDayMonth(day)

/** Durée de l'animation de tracé des courbes (ms). */
const DRAW_MS = 900

/** Petite réaction emoji, toujours positive (jamais de moquerie sur le poids). */
function vibe(pct: number | undefined): string {
  if (pct === undefined) return ''
  if (pct <= -5) return '🚀'
  if (pct <= -2) return '🎉'
  if (pct < 0) return '✨'
  if (pct === 0) return '🏁'
  return '💪'
}

/** Graduations « propres » de l'axe des % (0 toujours visible). */
function niceScale(values: number[]): { domain: [number, number]; ticks: number[] } {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min
  const step = span <= 1.6 ? 0.5 : span <= 5 ? 1 : span <= 12 ? 2 : 5
  const lo = Math.floor((min - step * 0.35) / step) * step
  const hi = Math.max(0, Math.ceil(max / step) * step)
  const ticks: number[] = []
  for (let t = hi; t >= lo - 1e-9; t -= step) ticks.push(Math.round(t * 10) / 10)
  // Un peu d'air au-dessus du dernier trait pour les points posés sur la ligne de départ.
  return { domain: [lo, hi + step * 0.3], ticks }
}

interface Series {
  player: Player
  points: WeighIn[]
  last: WeighIn | null
  lastIndex: number
}

function computeRace(weighIns: WeighIn[], players: Player[]) {
  const days = [...new Set(weighIns.filter((w) => players.some((p) => p.id === w.playerId)).map((w) => w.day))].sort()
  const rows: Row[] = days.map((day) => ({ day, pct: {} }))
  const series: Series[] = players.map((player) => {
    const points = weighInsOf(weighIns, player.id)
    for (const w of points) {
      const row = rows.find((r) => r.day === w.day)
      if (row) row.pct[player.id] = Math.round(w.fromStartPct * 100) / 100
    }
    const last = points.at(-1) ?? null
    return { player, points, last, lastIndex: last ? days.indexOf(last.day) : -1 }
  })
  const values = series.flatMap((s) => s.points.map((w) => w.fromStartPct))
  return { rows, series, scale: niceScale(values) }
}

/**
 * Données du graphique, recalculées seulement si les pesées ou les joueurs changent
 * vraiment (pas à chaque nouveau snapshot, ex. un check-in de l'autre) : sinon les
 * avatars rejoueraient leur apparition à chaque événement temps réel.
 */
function useRace(weighIns: WeighIn[], me: Player, other: Player) {
  const signature = [
    ...[me, other].map((p) => `${p.id}~${p.name}~${p.emoji}~${p.color}~${p.goalFromStartPct}`),
    ...weighIns.map((w) => `${w.playerId}~${w.day}~${w.fromStartPct}`),
  ].join('|')
  const [cache, setCache] = useState(() => ({ signature, race: computeRace(weighIns, [me, other]), players: [me, other] }))
  if (cache.signature !== signature) {
    // Mise à jour pendant le rendu (motif React recommandé pour dériver un état).
    const next = { signature, race: computeRace(weighIns, [me, other]), players: [me, other] }
    setCache(next)
    return next
  }
  return cache
}

/** Les points de la courbe : petites billes, et l'avatar du joueur au dernier point. */
function makeDot(player: Player, lastIndex: number, reduced: boolean) {
  return function RaceDot(props: DotItemDotProps) {
    const { cx, cy, index, value } = props
    if (cx == null || cy == null || value == null) return null
    if (index === lastIndex) {
      return (
        <motion.g
          initial={reduced ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...springy, delay: reduced ? 0 : DRAW_MS / 1000 }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        >
          <circle cx={cx} cy={cy} r={15} fill={player.color} stroke="var(--color-surface)" strokeWidth={3} />
          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize={17} aria-hidden="true">
            {player.emoji}
          </text>
        </motion.g>
      )
    }
    return <circle cx={cx} cy={cy} r={4.5} fill={player.color} stroke="var(--color-surface)" strokeWidth={2} />
  }
}

function RaceTooltip({ active, payload, label, players }: TooltipContentProps & { players: Player[] }) {
  if (!active || !payload?.length || typeof label !== 'string') return null
  const row = payload[0]?.payload as Row | undefined
  if (!row) return null
  return (
    <div className="card min-w-44 px-3.5 py-2.5 shadow-[var(--shadow-pop)]">
      <p className="font-display text-[14px] font-semibold text-muted">⚖️ Pesée du {weighDay(label)}</p>
      <ul className="mt-1.5 space-y-1">
        {players.map((p) => {
          const v = row.pct[p.id]
          return (
            <li key={p.id} className="flex items-center gap-2 text-[15px] font-bold text-ink">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="score-num text-[16px]">{v === undefined ? '—' : formatPct(v)}</span>
              <span className="w-5 text-center" aria-hidden="true">
                {vibe(v)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Pastille d'un joueur (sert aussi de légende) : % actuel + chemin vers l'objectif. */
function RaceChip({ series }: { series: Series }) {
  const reduced = useReducedMotion() ?? false
  const { player, last } = series
  const pct = last?.fromStartPct
  const goal = player.goalFromStartPct
  const progress = goal !== null && goal < 0 && pct !== undefined ? Math.max(0, Math.min(1, pct / goal)) : null
  return (
    <div
      className="min-w-0 rounded-[1.25rem] px-3 py-2.5"
      style={{ background: tint(player.color, 14), boxShadow: `inset 0 0 0 2px ${tint(player.color, 34)}` }}
    >
      <div className="flex items-center gap-2">
        <Avatar player={player} size="xs" />
        <span className="truncate font-display text-[15px] font-semibold" style={{ color: deep(player.color, 72) }}>
          {player.name}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="score-num text-[28px] leading-none text-ink">{pct === undefined ? '—' : formatPct(pct)}</span>
        <span className="text-[18px] leading-none" aria-hidden="true">
          {vibe(pct)}
        </span>
      </div>
      {progress !== null && goal !== null ? (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
              <motion.div
                className="h-full rounded-full"
                style={{ background: player.color }}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: `${Math.max(progress * 100, 4)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.3 }}
              />
            </div>
            <span className="score-num text-[13px] text-ink-soft">{Math.round(progress * 100)}&nbsp;%</span>
          </div>
          {/* Sur iPhone SE, la valeur passe à la ligne plutôt que d'être coupée. */}
          <p className="mt-1 text-[13px] leading-snug font-bold text-ink-soft">
            🎯 Objectif <span className="whitespace-nowrap">{formatPct(goal)}</span>
          </p>
        </div>
      ) : (
        <p className="mt-1.5 text-[13px] font-bold text-ink-soft">{pct === undefined ? 'Pas encore de pesée ⚖️' : 'depuis le départ'}</p>
      )}
    </div>
  )
}

export function WeightRace({ weighIns, me, other }: { weighIns: WeighIn[]; me: Player; other: Player }) {
  const reduced = useReducedMotion() ?? false
  const {
    players,
    race: { rows, series, scale },
  } = useRace(weighIns, me, other)
  // Fonctions stables d'un rendu à l'autre (sinon Recharts relance l'animation des courbes).
  const lines = useMemo(
    () =>
      series.map((s) => ({
        series: s,
        dataKey: (r: Row) => r.pct[s.player.id] ?? null,
        dot: makeDot(s.player, s.lastIndex, reduced),
      })),
    [series, reduced],
  )

  const hasRace = rows.length >= 2

  return (
    <Card className="px-3 pt-3 pb-3">
      <div className="grid grid-cols-2 gap-2">
        {series.map((s) => (
          <RaceChip key={s.player.id} series={s} />
        ))}
      </div>

      {hasRace ? (
        <div className="mt-3 h-[220px] w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 18, right: 20, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <ReferenceArea y1={scale.domain[0]} y2={0} fill="var(--color-nickel)" fillOpacity={0.1} ifOverflow="hidden" />
              <CartesianGrid vertical={false} stroke="var(--color-line)" strokeWidth={1} />
              <ReferenceLine
                y={0}
                stroke="var(--color-muted)"
                strokeWidth={1.5}
                label={{ value: '🏁 départ', position: 'insideBottomRight', offset: 7, fill: 'var(--color-muted)', fontSize: 12, fontWeight: 700 }}
              />
              <XAxis
                dataKey="day"
                tickFormatter={tickDay}
                tick={{ fill: 'var(--color-muted)', fontSize: 12, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                minTickGap={8}
                padding={{ left: 12, right: 12 }}
              />
              <YAxis
                domain={scale.domain}
                ticks={scale.ticks}
                tickFormatter={axisPct}
                tick={{ fill: 'var(--color-muted)', fontSize: 12, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
                width={46}
                allowDataOverflow
              />
              <Tooltip
                content={(props) => <RaceTooltip {...props} players={players} />}
                cursor={{ stroke: 'var(--color-line)', strokeWidth: 2 }}
                isAnimationActive={!reduced}
              />
              {lines.map(({ series: s, dataKey, dot }) => (
                <Line
                  key={s.player.id}
                  dataKey={dataKey}
                  name={s.player.name}
                  type="monotone"
                  stroke={s.player.color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  connectNulls
                  dot={dot}
                  activeDot={{ r: 7, stroke: 'var(--color-surface)', strokeWidth: 3, fill: s.player.color }}
                  isAnimationActive={!reduced}
                  animationDuration={DRAW_MS}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center rounded-[1.25rem] bg-sunken px-4 py-6 text-center">
          <span className="emoji-xl" aria-hidden="true">
            ⚖️
          </span>
          <p className="mt-2 font-display text-[17px] font-semibold text-ink">
            {rows.length === 0 ? 'Pas encore de pesée' : `Le départ est donné${NBSP}!`}
          </p>
          <p className="mt-1 text-[15px] text-ink-soft">La course commence dès la prochaine pesée 🏁</p>
        </div>
      )}

      {/* Version texte du graphique, pour les lecteurs d'écran. */}
      <table className="sr-only">
        <caption>Évolution en{NBSP}% depuis la première pesée</caption>
        <thead>
          <tr>
            <th scope="col">Pesée</th>
            {players.map((p) => (
              <th key={p.id} scope="col">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <th scope="row">{weighDay(r.day)}</th>
              {players.map((p) => (
                <td key={p.id}>{formatPct(r.pct[p.id])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {hasRace && (
        <p className="mt-2 px-1 text-center text-[14px] leading-snug font-semibold text-muted">
          📉 Ici, plus ça descend, plus ça avance{NBSP}! Les kilos restent secrets 🤫
        </p>
      )}
    </Card>
  )
}
