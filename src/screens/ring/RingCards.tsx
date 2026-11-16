/**
 * Tout ce qui entoure le tir à la corde : en-tête, gros bouton check-in, pesée,
 * enjeu, bilan, dernière manche et petites bannières (proposition, gage en attente).
 */
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { isStakeEditable } from '../../core/season'
import { weighInPoints } from '../../core/scoring'
import { weighInReaction } from '../../core/taunts'
import { formatPct } from '../../core/weight'
import { useDuel } from '../../data/DuelProvider'
import { Avatar, Button, Card, springy } from '../../ui/kit'
import { useNav } from '../../ui/nav'
import { daysLeftLabel, plural, weekRange } from './format'
import type { RingData } from './useRingData'

// ─── Petits éléments communs ────────────────────────────────────────────────

/** Apparition en cascade des blocs du Ring. */
export function Reveal({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion() ?? false
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.06 * index }}
    >
      {children}
    </motion.div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="font-display text-[13px] font-semibold tracking-wide text-muted uppercase">{children}</div>
}

/** Bannière tapable (proposition à valider, gage en attente…). */
export function Banner({
  emoji,
  title,
  subtitle,
  color,
  onClick,
  wiggle = false,
}: {
  emoji: string
  title: ReactNode
  subtitle?: ReactNode
  /** Couleur d'accent (teinte du fond et liseré). */
  color: string
  onClick: () => void
  wiggle?: boolean
}) {
  const reduced = useReducedMotion() ?? false
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={springy}
      className="card flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
      style={{
        background: `color-mix(in oklab, ${color} 13%, var(--color-surface))`,
        boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${color} 30%, transparent), var(--shadow-card)`,
      }}
    >
      <motion.span
        className="shrink-0 text-[34px] leading-none"
        animate={wiggle && !reduced ? { rotate: [0, -14, 12, -8, 0], scale: [1, 1.12, 1] } : undefined}
        transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2.8 }}
        aria-hidden="true"
      >
        {emoji}
      </motion.span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[17px] leading-snug font-semibold text-balance text-ink">{title}</span>
        {subtitle && <span className="mt-0.5 block text-[15px] leading-snug text-ink-soft">{subtitle}</span>}
      </span>
      <span className="shrink-0 font-display text-[28px] leading-none text-muted" aria-hidden="true">
        ›
      </span>
    </motion.button>
  )
}

// ─── En-tête ─────────────────────────────────────────────────────────────────

function greeting(hour: number): string {
  if (hour < 5) return 'Encore debout'
  if (hour < 12) return 'Bonjour'
  if (hour < 18) return 'Salut'
  return 'Bonsoir'
}

export function RingHeader() {
  const { season, me, hour } = useDuel()
  const week = season.current
  const n = week.daysLeft
  const last = n <= 1
  return (
    <header className="flex items-center justify-between gap-3 pt-1">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold text-muted">
          {greeting(hour)} {me.name} 👋
        </p>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight text-ink">🥊 Manche {week.index}</h1>
        <p className="text-[15px] font-semibold text-ink-soft">{last ? 'Dernier jour, tout se joue ce soir !' : weekRange(week.weekStart, week.weekEnd)}</p>
      </div>
      <motion.div
        className="card flex min-w-[84px] shrink-0 flex-col items-center px-3 pt-2 pb-2.5"
        style={last ? { background: 'color-mix(in oklab, var(--color-craquage) 14%, var(--color-surface))' } : undefined}
        initial={{ scale: 0.6, rotate: -8 }}
        animate={{ scale: 1, rotate: 3 }}
        transition={springy}
        aria-label={daysLeftLabel(n)}
        role="img"
      >
        <span className="text-[18px] leading-none" aria-hidden="true">
          {last ? '🔥' : '⏳'}
        </span>
        <span className="score-num text-[34px] leading-none text-ink">{n}</span>
        <span className="text-center text-[12px] leading-tight font-extrabold text-muted">
          {n >= 2 ? 'jours' : 'jour'}
          <br />
          {n >= 2 ? 'restants' : 'restant'}
        </span>
      </motion.div>
    </header>
  )
}

// ─── Gros bouton check-in ────────────────────────────────────────────────────

export function CheckinCta({ data }: { data: RingData }) {
  const { setTab } = useNav()
  const { hour } = useDuel()
  const reduced = useReducedMotion() ?? false
  const { today, player } = data.me
  const left = today.total - today.filled
  const partial = today.filled > 0 && !today.complete

  const caption =
    hour >= 21
      ? '⏰ Avant minuit, sinon c’est 0 !'
      : partial
        ? `Plus que ${plural(left, 'habitude')} 💪`
        : '15 secondes chrono ⏱️'

  return (
    <div className="space-y-2.5">
      {today.complete ? (
        <Button variant="soft" size="md" block onClick={() => setTab('checkin')} className="justify-between! px-4!">
          <span>✅ Check-in fait · modifier</span>
          <span
            className="rounded-full px-2.5 py-0.5 text-[15px]"
            style={{ background: 'color-mix(in oklab, var(--color-nickel) 18%, transparent)', color: 'color-mix(in oklab, var(--color-nickel) 75%, var(--color-ink))' }}
          >
            {today.score}/100{today.perfect ? ' 💯' : ''}
          </span>
        </Button>
      ) : (
        <Button size="xl" block color={player.color} onClick={() => setTab('checkin')} className="py-2">
          <motion.span
            className="text-[36px] leading-none"
            animate={reduced ? undefined : { rotate: [0, -14, 12, -6, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2.4 }}
            aria-hidden="true"
          >
            {partial ? '✏️' : '✅'}
          </motion.span>
          <span className="flex flex-col items-start text-left leading-none">
            <span>{partial ? 'Finir mon check-in' : 'Mon check-in'}</span>
            <span className="mt-1.5 font-body text-[15px] font-bold opacity-90">{caption}</span>
          </span>
        </Button>
      )}
      {data.yesterdayToFix && (
        <button
          type="button"
          onClick={() => setTab('checkin')}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-3 text-[15px] font-bold text-ink-soft"
          style={{ background: 'color-mix(in oklab, var(--color-unpeu) 14%, transparent)' }}
        >
          <span aria-hidden="true">🙈</span>
          <span>
            Hier n’est pas complet : <span className="underline decoration-2 underline-offset-2">rattrape-le</span> avant minuit
          </span>
        </button>
      )}
    </div>
  )
}

// ─── Jour de la pesée ────────────────────────────────────────────────────────

export function WeighInCard({ data }: { data: RingData }) {
  const { openSheet } = useNav()
  const reduced = useReducedMotion() ?? false
  const mine = data.me.weighInToday
  const other = data.other.player
  const otherDone = data.other.weighInToday !== null

  const otherLine = (
    <div className="mt-3 flex items-center gap-2 border-t-2 border-dashed border-line pt-3 text-[15px] font-semibold text-ink-soft">
      <Avatar player={other} size="xs" />
      <span>
        {other.name} : {otherDone ? '✅ c’est fait' : '👀 pas encore'}
      </span>
    </div>
  )

  if (mine) {
    const pts = weighInPoints(mine)
    const reaction = weighInReaction(mine.changePct, pts)
    return (
      <Card style={{ background: 'color-mix(in oklab, var(--color-nickel) 10%, var(--color-surface))' }}>
        <div className="flex items-center gap-3">
          <span className="emoji-xl shrink-0 text-[48px]!" aria-hidden="true">
            ⚖️
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[20px] leading-tight font-bold text-ink">Pesée faite ✅</div>
            <div className="mt-0.5 text-[15px] leading-snug text-ink-soft">
              {mine.changePct === null ? reaction.text : `${formatPct(mine.changePct)} depuis la dernière pesée ${reaction.emoji}`}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="score-num text-[34px] leading-none" style={{ color: 'color-mix(in oklab, var(--color-nickel) 80%, var(--color-ink))' }}>
              +{pts}
            </div>
            <div className="font-display text-[13px] font-semibold text-muted">pts</div>
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">{otherLine}</div>
          <Button variant="soft" size="sm" onClick={() => openSheet({ kind: 'weighin' })} className="mb-0.5 min-h-12!">
            Corriger
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card
      className="relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, color-mix(in oklab, var(--color-gold) 26%, var(--color-surface)), var(--color-surface) 70%)',
      }}
    >
      <div className="flex items-center gap-3">
        <motion.span
          className="emoji-xl shrink-0 text-[56px]!"
          animate={reduced ? undefined : { rotate: [-6, 6, -6], y: [0, -4, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          ⚖️
        </motion.span>
        <div className="min-w-0">
          <div className="font-display text-[21px] leading-tight font-bold text-balance text-ink">C’est le jour de la pesée ⚖️</div>
          <div className="mt-1 text-[15px] leading-snug text-ink-soft">Jusqu’à 100 pts en jeu. Hop, sur la balance !</div>
        </div>
      </div>
      <Button size="lg" block className="mt-4" onClick={() => openSheet({ kind: 'weighin' })}>
        Je me pèse 🫣
      </Button>
      {otherLine}
    </Card>
  )
}

// ─── Enjeu de la semaine ─────────────────────────────────────────────────────

export function StakeCard() {
  const { season, today } = useDuel()
  const { setTab } = useNav()
  const reduced = useReducedMotion() ?? false
  const week = season.current
  const stake = week.meta?.stake?.trim() || null
  const editable = isStakeEditable(week.weekStart, today)

  const body = (
    <>
      <motion.div
        className="grid size-16 shrink-0 place-items-center rounded-[20px] text-[40px] leading-none"
        style={{ background: 'color-mix(in oklab, var(--color-gold) 24%, transparent)' }}
        animate={reduced ? undefined : { rotate: [0, 0, -16, 14, -6, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 4 }}
        aria-hidden="true"
      >
        🎲
      </motion.div>
      <div className="min-w-0 flex-1">
        <Eyebrow>Enjeu de la semaine</Eyebrow>
        <div className="mt-0.5 font-display text-[19px] leading-snug font-semibold text-balance text-ink">
          {stake ?? 'La roulette n’a pas encore tourné…'}
        </div>
        <div className="mt-1 text-[14px] leading-snug font-semibold text-muted">
          {editable
            ? '✏️ Modifiable jusqu’à ce soir minuit'
            : stake
              ? 'Le perdant s’y colle 😈'
              : 'Lance-la dans les réglages 🎰'}
        </div>
      </div>
    </>
  )

  if (editable || !stake) {
    return (
      <motion.button
        type="button"
        onClick={() => setTab('settings')}
        whileTap={{ scale: 0.97 }}
        transition={springy}
        className="card flex w-full items-center gap-4 p-4 text-left"
        aria-label={`Enjeu de la semaine : ${stake ?? 'pas encore choisi'}. Modifier dans les réglages`}
      >
        {body}
        <span className="shrink-0 font-display text-[28px] leading-none text-muted" aria-hidden="true">
          ›
        </span>
      </motion.button>
    )
  }
  return <Card className="flex items-center gap-4">{body}</Card>
}

// ─── Bilan global ────────────────────────────────────────────────────────────

export function RecordTile() {
  const { season, me, other, playerById } = useDuel()
  const { setTab } = useNav()
  const { wins, ties, streak } = season.record
  const a = wins[me.id] ?? 0
  const b = wins[other.id] ?? 0
  const verdict = a === b ? 'Pile à égalité 🤝' : a > b ? 'Tu mènes 😎' : `${other.name} mène 😏`

  return (
    <motion.button
      type="button"
      onClick={() => setTab('stats')}
      whileTap={{ scale: 0.96 }}
      transition={springy}
      className="card flex h-full w-full flex-col p-4 text-left"
      aria-label={`Bilan des manches : ${me.name} ${a} – ${b} ${other.name}${ties ? `, ${plural(ties, 'égalité')}` : ''}. Voir l’historique`}
    >
      <Eyebrow>🏆 Bilan</Eyebrow>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-end gap-1">
        <NamedNumber value={a} name={me.name} color={me.color} />
        <span className="pb-6 font-display text-[26px] font-bold text-muted">–</span>
        <NamedNumber value={b} name={other.name} color={other.color} />
      </div>
      <div className="mt-1 text-[14px] leading-snug font-bold text-ink-soft">
        {verdict}
        {ties > 0 && <span className="block font-semibold text-muted">+ {plural(ties, 'égalité')}</span>}
        {streak.playerId && streak.count >= 2 && (
          <span className="block font-semibold text-muted">
            🔥 {playerById(streak.playerId).name} : {streak.count} d’affilée
          </span>
        )}
      </div>
      <div className="mt-auto pt-1 text-[14px] font-bold text-muted">Historique ›</div>
    </motion.button>
  )
}

function NamedNumber({ value, name, color }: { value: number; name: string; color: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span className="score-num text-[42px] leading-none" style={{ color: `color-mix(in oklab, ${color} 88%, var(--color-ink))` }}>
        {value}
      </span>
      <span className="mt-1 max-w-full truncate text-[13px] font-bold" style={{ color: `color-mix(in oklab, ${color} 65%, var(--color-ink))` }}>
        {name}
      </span>
    </div>
  )
}

// ─── Dernière manche ─────────────────────────────────────────────────────────

export function LastRoundTile() {
  const { season, me, other, playerById } = useDuel()
  const { openSheet } = useNav()
  const reduced = useReducedMotion() ?? false
  const last = season.finished.at(-1)

  if (!last) {
    return (
      <Card className="flex h-full flex-col">
        <Eyebrow>📜 Manches</Eyebrow>
        <div className="my-2 text-[44px] leading-none" aria-hidden="true">
          🌱
        </div>
        <div className="font-display text-[17px] leading-snug font-semibold text-ink">Première manche !</div>
        <div className="text-[14px] leading-snug text-muted">Tout reste à écrire ✍️</div>
      </Card>
    )
  }

  const winner = last.outcome.winnerId ? playerById(last.outcome.winnerId) : null
  const mine = last.scores[me.id]?.total ?? 0
  const theirs = last.scores[other.id]?.total ?? 0

  return (
    <motion.button
      type="button"
      onClick={() => openSheet({ kind: 'results', weekStart: last.weekStart })}
      whileTap={{ scale: 0.96 }}
      transition={springy}
      className="card flex h-full w-full flex-col p-4 text-left"
      aria-label={`Manche ${last.index} : ${winner ? `${winner.name} gagne` : 'égalité'}, ${mine} à ${theirs}. Revoir les résultats`}
    >
      <Eyebrow>📜 Manche {last.index}</Eyebrow>
      <div className="mt-2 flex items-center gap-2.5">
        {winner ? (
          <div className="relative shrink-0">
            <motion.span
              className="absolute -top-4 left-1/2 -ml-3 text-[24px] leading-none"
              animate={reduced ? undefined : { y: [0, -3, 0], rotate: [-8, 8, -8] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden="true"
            >
              👑
            </motion.span>
            <Avatar player={winner} size="sm" />
          </div>
        ) : (
          <span className="shrink-0 text-[40px] leading-none" aria-hidden="true">
            🤝
          </span>
        )}
        <div className="min-w-0 font-display text-[17px] leading-tight font-semibold text-balance break-words hyphens-auto text-ink" lang="fr">
          {winner ? (winner.id === me.id ? 'Tu as gagné 🎉' : `${winner.name} a gagné`) : 'Égalité !'}
        </div>
      </div>
      <div className="score-num mt-2 text-[20px]">
        <span style={{ color: `color-mix(in oklab, ${me.color} 85%, var(--color-ink))` }}>{mine}</span>
        <span className="mx-1 text-muted">–</span>
        <span style={{ color: `color-mix(in oklab, ${other.color} 85%, var(--color-ink))` }}>{theirs}</span>
      </div>
      <div className="mt-auto pt-1 text-[14px] font-bold text-muted">Revoir les résultats ›</div>
    </motion.button>
  )
}

// ─── Gage en attente ─────────────────────────────────────────────────────────

export function GageBanner() {
  const { season, me, other } = useDuel()
  const { openSheet } = useNav()
  const last = season.finished.at(-1)
  if (!last) return null
  const unpaid = last.outcome.gageFor.filter((id) => !last.meta?.gagePaid?.[id])
  if (unpaid.length === 0) return null

  const gage = last.meta?.stake?.trim() || 'le gage de la manche'
  const forMe = unpaid.includes(me.id)
  const forOther = unpaid.includes(other.id)
  const subtitle =
    forMe && forOther
      ? 'Pour vous deux ! Chacun valide celui de l’autre ✅'
      : forMe
        ? `C’est pour toi 😬 ${other.name} valide quand c’est fait.`
        : `${other.name} te le doit 😏 Valide quand c’est fait ✅`

  return (
    <Banner
      emoji="🫣"
      title={`Gage en attente : ${gage}`}
      subtitle={subtitle}
      color="var(--color-unpeu)"
      onClick={() => openSheet({ kind: 'results', weekStart: last.weekStart })}
    />
  )
}

// ─── Proposition à valider ───────────────────────────────────────────────────

export function ProposalBanner({ count }: { count: number }) {
  const { other } = useDuel()
  const { setTab } = useNav()
  if (count === 0) return null
  return (
    <Banner
      emoji="📬"
      title={count > 1 ? `${other.name} propose ${count} changements` : `${other.name} propose un changement`}
      subtitle="Accepte ou refuse en un tap"
      color={other.color}
      onClick={() => setTab('settings')}
      wiggle
    />
  )
}
