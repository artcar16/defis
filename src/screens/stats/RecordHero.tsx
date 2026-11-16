/**
 * 🏆 Le tableau des scores : bilan global des manches (« Laetitia 2 – 1 Arthus »),
 * couronnes, série en cours et plus gros écart.
 */
import { motion, useReducedMotion } from 'motion/react'
import { formatPts, NBSP, plural, pluralWord } from '../../core/fr'
import type { Season } from '../../core/season'
import type { Player } from '../../core/types'
import { deep, tint } from '../../ui/color'
import { Avatar, Card, Pill, springy } from '../../ui/kit'
import { recordLine } from './format'

function Side({ player, leader }: { player: Player; leader: boolean }) {
  const reduced = useReducedMotion() ?? false
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <div className="relative pt-3">
        {leader && (
          <motion.span
            className="absolute -top-2 left-1/2 text-[26px] leading-none"
            style={{ x: '-50%' }}
            initial={reduced ? false : { y: -14, opacity: 0, rotate: -20 }}
            animate={reduced ? { y: 0, opacity: 1, rotate: -8 } : { y: [0, -4, 0], opacity: 1, rotate: -8 }}
            transition={reduced ? springy : { y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }, default: springy }}
            aria-hidden="true"
          >
            👑
          </motion.span>
        )}
        <Avatar player={player} size="lg" />
      </div>
      {/* Le prénom passe à la ligne plutôt que d'être coupé (jusqu'à 20 caractères). */}
      <span
        className="mt-1 max-w-full text-center font-display text-[17px] leading-tight font-semibold text-balance [overflow-wrap:anywhere]"
        style={{ color: deep(player.color, 72) }}
      >
        {player.name}
      </span>
    </div>
  )
}

/** `verdict` : quand tombe le premier verdict (« lundi »…), affiché tant qu'aucune manche n'est jouée. */
export function RecordHero({ season, me, other, verdict }: { season: Season; me: Player; other: Player; verdict: string }) {
  const reduced = useReducedMotion() ?? false
  const { record, finished } = season
  const mine = record.wins[me.id] ?? 0
  const theirs = record.wins[other.id] ?? 0
  const played = record.played

  // Plus gros écart de la saison.
  const biggest = finished.reduce<(typeof finished)[number] | null>(
    (best, w) => (w.outcome.winnerId && (!best || w.outcome.gap > best.outcome.gap) ? w : best),
    null,
  )
  const streakPlayer = record.streak.playerId ? (record.streak.playerId === me.id ? me : other) : null

  return (
    <Card
      className="relative overflow-hidden px-4 pt-4 pb-4"
      style={{
        backgroundImage: `linear-gradient(100deg, ${tint(me.color, 16)} 0%, var(--color-surface) 42%, var(--color-surface) 58%, ${tint(other.color, 16)} 100%)`,
      }}
    >
      <p className="text-center font-display text-[13px] font-semibold tracking-wide text-muted uppercase">
        🏆 Bilan des manches
      </p>

      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <Side player={me} leader={mine > theirs} />
        <div className="flex flex-col items-center" aria-label={`${me.name} ${mine}, ${other.name} ${theirs}`} role="img">
          <div className="score-num flex items-baseline gap-2 text-[56px] leading-none">
            <motion.span
              key={`m${mine}`}
              initial={reduced ? false : { scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={springy}
              style={{ color: deep(me.color, 85) }}
            >
              {mine}
            </motion.span>
            <span className="text-[34px] text-muted">–</span>
            <motion.span
              key={`t${theirs}`}
              initial={reduced ? false : { scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...springy, delay: 0.08 }}
              style={{ color: deep(other.color, 85) }}
            >
              {theirs}
            </motion.span>
          </div>
          <span className="mt-1 text-center text-[13px] font-bold text-muted">
            {plural(played, 'manche')} {pluralWord(played, 'jouée')}
          </span>
        </div>
        <Side player={other} leader={theirs > mine} />
      </div>

      <p className="mt-3 text-center text-[15px] leading-snug font-semibold text-balance text-ink-soft">
        {recordLine(me, other, mine, theirs, played, verdict)}
      </p>

      {played > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {streakPlayer && record.streak.count >= 2 && (
            <Pill color={streakPlayer.color}>
              🔥 {streakPlayer.id === me.id ? 'Toi' : streakPlayer.name}
              {NBSP}: {plural(record.streak.count, 'victoire')} d’affilée
            </Pill>
          )}
          {record.ties > 0 && <Pill>🤝 {plural(record.ties, 'égalité')}</Pill>}
          {biggest && (
            <Pill className="text-center text-balance">
              💥 Plus gros écart{NBSP}: {formatPts(biggest.outcome.gap)} (manche{NBSP}{biggest.index})
            </Pill>
          )}
        </div>
      )}
    </Card>
  )
}
