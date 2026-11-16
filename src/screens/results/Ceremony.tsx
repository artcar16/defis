/**
 * 🥁 La cérémonie : « Et la victoire revient à… » → les scores montent → la couronne 👑
 * tombe sur qui gagne (rayons dorés, confettis) → 😭 pour qui perd.
 */
import { AnimatePresence, motion } from 'motion/react'
import { formatPts, ptsUnit, typo, weekRangeLabel } from '../../core/fr'
import type { DayKey, Player } from '../../core/types'
import { deep, tint } from '../../ui/color'
import { Avatar, Button, springy } from '../../ui/kit'
import { useCountUp } from './useCountUp'
import type { WeekResults } from './useWeekResults'

export type Stage = 'drumroll' | 'count' | 'crown' | 'done'
const ORDER: Stage[] = ['drumroll', 'count', 'crown', 'done']
export const atLeast = (stage: Stage, min: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(min)

type Role = 'winner' | 'loser' | 'tie'

/** « du 9 au 15 novembre » ; à cheval sur deux mois, en abrégé pour tenir sur une ligne (« du 26 oct. au 1er nov. »). */
function rangeLabel(start: DayKey, end: DayKey): string {
  return weekRangeLabel(start, end, start.slice(0, 7) === end.slice(0, 7) ? 'MMMM' : 'MMM')
}

export function Ceremony({
  results,
  stage,
  countMs,
  meId,
  reduced,
  onSkip,
}: {
  results: WeekResults
  stage: Stage
  /** Durée du compteur pour le plus gros score (les autres montent à la même vitesse). */
  countMs: number
  meId: string
  reduced: boolean
  onSkip: () => void
}) {
  const { week, left, right, winner, tie, gap } = results
  const revealed = atLeast(stage, 'crown')
  const totals = [week.scores[left.id]?.total ?? 0, week.scores[right.id]?.total ?? 0]
  const maxTotal = Math.max(...totals, 1)
  const roleOf = (p: Player): Role => (tie ? 'tie' : winner?.id === p.id ? 'winner' : 'loser')

  return (
    <section className="relative overflow-x-clip pt-1 text-center" aria-label="Cérémonie des résultats">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-3 py-1 text-[13px] font-bold text-ink-soft shadow-[var(--shadow-card)]">
        🏁 Manche {week.index} · {rangeLabel(week.weekStart, week.weekEnd)}
      </p>

      {/* Titre : suspense, puis le verdict. */}
      <div className="mt-3 flex min-h-[72px] items-center justify-center px-2" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {revealed ? (
            <motion.h2
              key="verdict"
              className={`font-display leading-tight font-bold text-balance text-ink ${results.headline.length > 46 ? 'text-[22px]' : 'text-[26px]'}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={springy}
            >
              {results.headline}
            </motion.h2>
          ) : (
            <motion.h2
              key="suspense"
              className="font-display text-[30px] leading-tight font-bold text-ink"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              Et la victoire revient à
              <Dots reduced={reduced} />
            </motion.h2>
          )}
        </AnimatePresence>
      </div>

      {/* Le podium */}
      <div className="relative mt-2 grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-end gap-1">
        <PodiumColumn
          player={left}
          isMe={left.id === meId}
          total={totals[0]}
          maxTotal={maxTotal}
          role={roleOf(left)}
          stage={stage}
          countMs={countMs}
          reduced={reduced}
        />
        <Center stage={stage} tie={tie} gap={gap} reduced={reduced} />
        <PodiumColumn
          player={right}
          isMe={right.id === meId}
          total={totals[1]}
          maxTotal={maxTotal}
          role={roleOf(right)}
          stage={stage}
          countMs={countMs}
          reduced={reduced}
        />
      </div>
      <div className="mx-2 h-2.5 rounded-full bg-line" aria-hidden="true" />

      {/* Sous le podium : bouton Passer pendant le suspense, puis la petite phrase du perdant. */}
      <div className="mt-4 flex min-h-[64px] items-start justify-center">
        <AnimatePresence mode="wait" initial={false}>
          {!revealed ? (
            <motion.div key="skip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Button variant="soft" size="sm" className="min-h-12!" onClick={onSkip}>
                Passer ⏭️
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="line"
              className="relative w-full rounded-[22px] bg-surface px-4 py-3 text-left shadow-[var(--shadow-card)]"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...springy, delay: reduced ? 0 : 0.45 }}
            >
              <span className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 rounded-[3px] bg-surface" aria-hidden="true" />
              <p className="relative flex items-center gap-3 text-[16px] leading-snug font-bold text-ink">
                <span className="text-[30px] leading-none" aria-hidden="true">
                  {tie ? '🤝' : '😭'}
                </span>
                <span>{tie ? typo('Égalité parfaite : gage pour les deux !') : results.loserLine}</span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

// ─── Une colonne du podium ───────────────────────────────────────────────────

function PodiumColumn({
  player,
  isMe,
  total,
  maxTotal,
  role,
  stage,
  countMs,
  reduced,
}: {
  player: Player
  isMe: boolean
  total: number
  maxTotal: number
  role: Role
  stage: Stage
  countMs: number
  reduced: boolean
}) {
  const revealed = atLeast(stage, 'crown')
  // Même vitesse pour les deux : le plus petit score s'arrête en premier… suspense.
  const counted = useCountUp(total, stage === 'count', (countMs * total) / maxTotal)
  const shown = stage === 'drumroll' ? null : revealed ? total : counted
  const height = !revealed ? 92 : role === 'winner' ? 126 : role === 'loser' ? 80 : 108
  const winner = revealed && role === 'winner'
  const loser = revealed && role === 'loser'

  return (
    <div className="relative flex min-w-0 flex-col items-center">
      {/* Avatar + couronne */}
      <div className="relative mt-14">
        {winner && <Rays color={player.color} reduced={reduced} />}
        <motion.div
          animate={
            reduced || !revealed
              ? { scale: loser ? 0.92 : 1 }
              : winner
                ? { scale: [1, 1.18, 1.06], y: [0, -12, 0] }
                : loser
                  ? { scale: 0.92, rotate: [0, -7, 6, -4, 0] }
                  : { scale: [1, 1.1, 1] }
          }
          transition={{ duration: 0.7, delay: winner ? 0.35 : 0.15 }}
        >
          <Avatar player={player} size="xl" ring />
        </motion.div>

        {/* 👑 qui tombe du ciel */}
        <AnimatePresence>
          {winner && (
            <motion.span
              className="pointer-events-none absolute inset-x-0 -top-12 flex justify-center"
              initial={reduced ? false : { y: -220, rotate: -50, opacity: 0, scale: 1.5 }}
              animate={{ y: 0, rotate: -12, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 11, mass: 0.9 }}
              aria-hidden="true"
            >
              <span className="text-[60px] leading-none drop-shadow-[0_6px_6px_rgb(0_0_0/0.25)]">👑</span>
            </motion.span>
          )}
        </AnimatePresence>

        {/* 😭 pour le perdant */}
        <AnimatePresence>
          {revealed && role === 'loser' && (
            <motion.span
              className="absolute -right-2 -bottom-1 text-[40px] leading-none"
              initial={reduced ? false : { scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...springy, delay: reduced ? 0 : 0.3 }}
              aria-hidden="true"
            >
              😭
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <p
        className="mt-3 flex max-w-full items-center gap-1 font-display text-[17px] leading-tight font-semibold"
        style={{ color: deep(player.color, 72) }}
      >
        <span className="truncate">{player.name}</span>
        {isMe && (
          <span className="shrink-0 rounded-full px-1.5 py-px text-[11px] font-bold tracking-wide uppercase" style={{ background: tint(player.color, 20) }}>
            toi
          </span>
        )}
      </p>

      {/* La marche du podium, avec le score */}
      <motion.div
        className="relative mt-2 flex w-full flex-col items-center justify-start overflow-hidden rounded-t-[22px] rounded-b-[8px] pt-2.5"
        style={{
          background: `linear-gradient(180deg, ${tint(player.color, 32)}, ${tint(player.color, 14)})`,
          boxShadow: `inset 0 6px 0 ${player.color}`,
        }}
        initial={false}
        animate={{ height }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 18, delay: winner ? 0.2 : 0 }}
      >
        <span className="score-num text-[42px] leading-none" style={{ color: deep(player.color, 80) }}>
          {shown === null ? <QuestionMark reduced={reduced} /> : shown}
        </span>
        <span className="font-display text-[14px] font-semibold text-muted">{ptsUnit(shown ?? total)}</span>
        <AnimatePresence>
          {revealed && role !== 'tie' && (
            <motion.span
              className="absolute top-1 left-1 text-[22px] leading-none drop-shadow-[0_2px_2px_rgb(0_0_0/0.2)]"
              initial={reduced ? false : { scale: 0, y: -10 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ ...springy, delay: reduced ? 0 : 0.5 }}
              aria-label={role === 'winner' ? 'Première place' : 'Deuxième place'}
              role="img"
            >
              {role === 'winner' ? '🥇' : '🥈'}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/** Rayons dorés qui tournent derrière le gagnant. */
function Rays({ color, reduced }: { color: string; reduced: boolean }) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[230px] -translate-x-1/2 -translate-y-1/2"
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.25 }}
    >
      <motion.div
        className="size-full rounded-full"
        style={{
          background: `repeating-conic-gradient(color-mix(in oklab, var(--color-gold) 55%, transparent) 0deg 11deg, transparent 11deg 24deg), radial-gradient(circle, color-mix(in oklab, ${color} 30%, transparent), transparent 70%)`,
          maskImage: 'radial-gradient(circle, black 28%, transparent 68%)',
          WebkitMaskImage: 'radial-gradient(circle, black 28%, transparent 68%)',
        }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      />
    </motion.div>
  )
}

/** Au centre : 🥁 pendant le suspense, puis 🤝 ou l'écart final. */
function Center({ stage, tie, gap, reduced }: { stage: Stage; tie: boolean; gap: number; reduced: boolean }) {
  const revealed = atLeast(stage, 'crown')
  return (
    <div className="mt-[90px] flex flex-col items-center self-start">
      <AnimatePresence mode="wait" initial={false}>
        {!revealed ? (
          <motion.span
            key="drum"
            className="text-[44px] leading-none"
            animate={reduced ? undefined : { rotate: [-14, 14], y: [0, -3] }}
            transition={{ duration: 0.12, repeat: Infinity, repeatType: 'mirror' }}
            // Sortie avec sa propre transition (sinon elle hérite du repeat infini et ne finit jamais).
            exit={{ scale: 0, opacity: 0, rotate: 0, y: 0, transition: { duration: 0.15 } }}
            role="img"
            aria-label="Roulement de tambour"
          >
            🥁
          </motion.span>
        ) : tie ? (
          <motion.span
            key="tie"
            className="text-[44px] leading-none"
            initial={reduced ? false : { scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={springy}
            role="img"
            aria-label="Égalité"
          >
            🤝
          </motion.span>
        ) : (
          <motion.div
            key="gap"
            className="grid size-14 place-items-center rounded-full font-display ring-4 ring-surface"
            style={{
              background: 'radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--color-gold) 40%, white), var(--color-gold) 60%, var(--color-gold-dark))',
              color: 'color-mix(in oklab, var(--color-gold-dark) 30%, black)',
            }}
            initial={reduced ? false : { scale: 0, rotate: 90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ ...springy, delay: reduced ? 0 : 0.6 }}
            aria-label={typo(`Écart : ${formatPts(gap)}`)}
          >
            <span className="flex flex-col items-center leading-none" aria-hidden="true">
              <span className="text-[17px] font-bold">+{gap}</span>
              <span className="text-[11px] font-bold">{ptsUnit(gap)}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Dots({ reduced }: { reduced: boolean }) {
  return (
    <span aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block"
          animate={reduced ? undefined : { y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        >
          .
        </motion.span>
      ))}
    </span>
  )
}

function QuestionMark({ reduced }: { reduced: boolean }) {
  return (
    <motion.span
      className="inline-block"
      animate={reduced ? undefined : { rotate: [-8, 8], scale: [1, 1.08] }}
      transition={{ duration: 0.35, repeat: Infinity, repeatType: 'mirror' }}
    >
      ?
    </motion.span>
  )
}
