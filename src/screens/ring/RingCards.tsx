/**
 * Tout ce qui entoure le tir à la corde : en-tête, gros bouton check-in, pesée,
 * enjeu, bilan, dernière manche et petites bannières (proposition, gage en attente).
 */
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { RULES } from '../../config/rules'
import { addDays } from '../../core/dates'
import { formatPts, NBSP, plural, pluralWord, ptsUnit, typo, weekRangeLabel } from '../../core/fr'
import { isStakeEditable } from '../../core/season'
import { isInGoalZone, weighInPoints } from '../../core/scoring'
import { weighInReaction } from '../../core/taunts'
import { formatPct } from '../../core/weight'
import { useDuel } from '../../data/DuelProvider'
import { deep, tint } from '../../ui/color'
import { Avatar, Button, Card, springy } from '../../ui/kit'
import { ANCHORS, useNav } from '../../ui/nav'
import { daysLeftLabel, deadlineLabel, greetingLine } from './format'
import { KeepHyphenated } from './KeepHyphenated'
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

/** Typographie française sur un texte (le gage est saisi librement). */
function asTypo(node: ReactNode): ReactNode {
  return typeof node === 'string' ? <KeepHyphenated text={typo(node)} /> : node
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
        background: tint(color, 13),
        boxShadow: `inset 0 0 0 2px ${tint(color, 30, 'transparent')}, var(--shadow-card)`,
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
        <span className="block font-display text-[17px] leading-snug font-semibold text-balance text-ink">{asTypo(title)}</span>
        {subtitle && <span className="mt-0.5 block text-[15px] leading-snug text-ink-soft">{asTypo(subtitle)}</span>}
      </span>
      <span className="shrink-0 font-display text-[28px] leading-none text-muted" aria-hidden="true">
        ›
      </span>
    </motion.button>
  )
}

// ─── En-tête ─────────────────────────────────────────────────────────────────

export function RingHeader() {
  const { season, me, hour } = useDuel()
  const week = season.current
  const n = week.daysLeft
  const last = n <= 1
  return (
    <header className="flex items-center justify-between gap-3 pt-1">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold text-muted">{greetingLine(hour, me.name)}</p>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight text-ink">🥊 Manche {week.index}</h1>
        <p className="text-[15px] font-semibold text-ink-soft">
          {last ? `Dernier jour, tout se joue ce soir${NBSP}!` : weekRangeLabel(week.weekStart, week.weekEnd)}
        </p>
      </div>
      <motion.div
        className="card flex min-w-[84px] shrink-0 flex-col items-center px-3 pt-2 pb-2.5"
        style={last ? { background: tint('var(--color-craquage)', 14) } : undefined}
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
          {pluralWord(n, 'jour')}
          <br />
          {pluralWord(n, 'restant')}
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
      ? `⏰ Avant minuit, sinon c’est 0${NBSP}!`
      : partial
        ? `Plus ${left === 1 ? 'qu’une habitude' : `que ${plural(left, 'habitude')}`} 💪`
        : '15 secondes chrono ⏱️'

  return (
    <div className="space-y-2.5">
      {today.complete ? (
        <Button variant="soft" size="md" block onClick={() => setTab('checkin')} className="justify-between! px-4!">
          <span className="text-left">
            ✅ Check-in fait
            {/* Sur iPhone SE, la place manque : le bouton suffit à dire qu'on peut modifier. */}
            <span className="max-[359px]:hidden"> · modifier</span>
          </span>
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-[15px] whitespace-nowrap"
            style={{ background: tint('var(--color-nickel)', 18, 'transparent'), color: deep('var(--color-nickel)') }}
          >
            {today.score}/{RULES.week.dailyMax}
            {today.perfect ? ' 💯' : ''}
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
          onClick={() => setTab('checkin', { checkinDay: 'yesterday' })}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-3 py-1.5 text-[15px] leading-snug font-bold text-ink-soft"
          style={{ background: tint('var(--color-unpeu)', 14, 'transparent') }}
        >
          <span aria-hidden="true">🙈</span>
          <span className="text-balance">
            Hier n’est pas complet{NBSP}: <span className="whitespace-nowrap underline decoration-2 underline-offset-2">rattrape-le</span> avant minuit
          </span>
        </button>
      )}
    </div>
  )
}

// ─── Jour de la pesée ────────────────────────────────────────────────────────

export function WeighInCard({ data }: { data: RingData }) {
  const { openSheet } = useNav()
  const { snapshot, today } = useDuel()
  const reduced = useReducedMotion() ?? false
  const mine = data.me.weighInToday
  const other = data.other.player
  const otherDone = data.other.weighInToday !== null
  // Pas encore de pesée avant aujourd'hui : celle-ci sert de point de départ et ne rapporte rien.
  const isStart = !snapshot.weighIns.some((w) => w.playerId === data.me.player.id && w.day < today)

  const otherLine = (
    <div className="mt-3 flex items-center gap-2 border-t-2 border-dashed border-line pt-3 text-[15px] font-semibold text-ink-soft">
      <Avatar player={other} size="xs" />
      <span>
        {other.name}
        {NBSP}: {/* Le statut reste d'un bloc s'il passe à la ligne. */}
        {(otherDone ? '✅ c’est fait' : '👀 pas encore').replaceAll(' ', NBSP)}
      </span>
    </div>
  )

  if (mine) {
    const pts = weighInPoints(mine)
    const reaction = weighInReaction(mine.changePct, pts, mine.day, isInGoalZone(mine.goalDistancePct))
    return (
      <Card style={{ background: tint('var(--color-nickel)', 10) }}>
        <div className="flex items-center gap-3">
          <span className="emoji-xl shrink-0 text-[38px]! min-[360px]:text-[48px]!" aria-hidden="true">
            ⚖️
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[20px] leading-tight font-bold text-ink">Pesée faite{NBSP}✅</div>
            <div className="mt-0.5 text-[15px] leading-snug text-ink-soft">
              {/* 2 décimales : les points sont calculés sur la variation exacte (−0,46 % = 46 pts). */}
              {mine.changePct === null ? reaction.text : `${formatPct(mine.changePct, 2)} depuis la dernière pesée ${reaction.emoji}`}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="score-num text-[34px] leading-none" style={{ color: deep('var(--color-nickel)', 80) }}>
              {pts > 0 ? `+${pts}` : pts}
            </div>
            <div className="font-display text-[13px] font-semibold text-muted">{ptsUnit(pts)}</div>
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
        background: `linear-gradient(135deg, ${tint('var(--color-gold)', 26)}, var(--color-surface) 70%)`,
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
          <div className="mt-1 text-[15px] leading-snug text-ink-soft">
            {isStart
              ? `Ta pesée de départ${NBSP}: pas de points cette fois, elle sert de repère 📍`
              : `Jusqu’à ${formatPts(RULES.weighIn.maxPoints)} en jeu. Hop, sur la balance${NBSP}!`}
          </div>
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
  // Dernier jour où l'enjeu se change encore (RULES.stake.editableDays, 1 = le lundi seulement).
  const deadline = deadlineLabel(addDays(week.weekStart, RULES.stake.editableDays - 1), today)

  const title = stake ?? (editable ? 'La roulette n’a pas encore tourné…' : 'Pas d’enjeu cette semaine')
  const hint = editable
    ? stake
      ? `✏️ Modifiable jusqu’à ${deadline}`
      : `🎰 Lance-la dans les réglages d’ici ${deadline}`
    : stake
      ? 'Qui perd s’y colle 😈'
      : 'On joue pour l’honneur 🏅'

  const body = (
    <>
      <motion.div
        className="grid size-14 shrink-0 place-items-center rounded-[18px] text-[34px] leading-none min-[360px]:size-16 min-[360px]:rounded-[20px] min-[360px]:text-[40px]"
        style={{ background: tint('var(--color-gold)', 24, 'transparent') }}
        animate={reduced ? undefined : { rotate: [0, 0, -16, 14, -6, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 4 }}
        aria-hidden="true"
      >
        🎲
      </motion.div>
      <div className="min-w-0 flex-1">
        <Eyebrow>Enjeu de la semaine</Eyebrow>
        <div className="mt-0.5 font-display text-[19px] leading-snug font-semibold text-balance text-ink">
          <KeepHyphenated text={typo(title)} />
        </div>
        <div className="mt-1 text-[14px] leading-snug font-semibold text-muted">{hint}</div>
      </div>
    </>
  )

  // Le raccourci n'a de sens que tant que l'enjeu se modifie : ensuite il est verrouillé.
  if (editable) {
    return (
      <motion.button
        type="button"
        onClick={() => setTab('settings', { anchor: ANCHORS.stake })}
        whileTap={{ scale: 0.97 }}
        transition={springy}
        className="card flex w-full items-center gap-3 p-4 text-left min-[360px]:gap-4"
        aria-label={`Enjeu de la semaine${NBSP}: ${stake ?? 'pas encore choisi'}. Modifier dans les réglages`}
      >
        {body}
        <span className="shrink-0 font-display text-[28px] leading-none text-muted" aria-hidden="true">
          ›
        </span>
      </motion.button>
    )
  }
  return <Card className="flex items-center gap-3 min-[360px]:gap-4">{body}</Card>
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
      onClick={() => setTab('stats', { anchor: ANCHORS.history })}
      whileTap={{ scale: 0.96 }}
      transition={springy}
      className="card flex h-full w-full flex-col p-4 text-left"
      aria-label={`Bilan des manches${NBSP}: ${me.name} ${a} – ${b} ${other.name}${ties ? `, ${plural(ties, 'égalité')}` : ''}. Voir l’historique`}
    >
      <Eyebrow>🏆 Bilan</Eyebrow>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-start gap-1">
        <NamedNumber value={a} name={me.name} color={me.color} />
        <span className="font-display text-[26px] leading-[42px] font-bold text-muted">–</span>
        <NamedNumber value={b} name={other.name} color={other.color} />
      </div>
      <div className="mt-1 text-[14px] leading-snug font-bold text-ink-soft">
        {verdict}
        {ties > 0 && <span className="block font-semibold text-muted">+ {plural(ties, 'égalité')}</span>}
        {streak.playerId && streak.count >= 2 && (
          <span className="block font-semibold text-muted">
            🔥 {playerById(streak.playerId).name}
            {NBSP}: {plural(streak.count, 'victoire')} d’affilée
          </span>
        )}
      </div>
      <div className="mt-auto pt-1 text-[14px] font-bold text-muted">Historique ›</div>
    </motion.button>
  )
}

/** Un score du bilan et le prénom dessous (le prénom passe à la ligne plutôt que d'être coupé). */
function NamedNumber({ value, name, color }: { value: number; name: string; color: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span className="score-num text-[42px] leading-none" style={{ color: deep(color, 88) }}>
        {value}
      </span>
      <span className="mt-1 max-w-full text-center text-[13px] leading-tight font-bold break-words" style={{ color: deep(color, 65) }}>
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
      aria-label={`Manche ${last.index}${NBSP}: ${winner ? `${winner.name} gagne` : 'égalité'}, ${mine} à ${theirs}. Revoir les résultats`}
    >
      <Eyebrow>📜 Manche {last.index}</Eyebrow>
      {/* mt-6 : place pour la couronne, qui dépasse de 16 px (+3 px d'animation) au-dessus de l'avatar. */}
      <div className={`flex items-center gap-2.5 ${winner ? 'mt-6' : 'mt-2'}`}>
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
        <div className="min-w-0 font-display text-[17px] leading-tight font-semibold text-balance break-words hyphens-none text-ink">
          {winner ? (winner.id === me.id ? 'Tu as gagné 🎉' : `${winner.name} a gagné`) : `Égalité${NBSP}!`}
        </div>
      </div>
      <div className="score-num mt-2 text-[20px]">
        <span style={{ color: deep(me.color, 85) }}>{mine}</span>
        <span className="mx-1 text-muted">–</span>
        <span style={{ color: deep(other.color, 85) }}>{theirs}</span>
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

  const gage = last.meta?.stake?.trim() || null
  const forMe = unpaid.includes(me.id)
  const forOther = unpaid.includes(other.id)
  const subtitle =
    forMe && forOther
      ? `Pour vous deux${NBSP}! Chacun valide celui de l’autre ✅`
      : forMe
        ? `C’est pour toi 😬 ${other.name} valide quand c’est fait.`
        : `${other.name} te le doit 😏 Valide quand c’est fait ✅`

  return (
    <Banner
      emoji="🫣"
      title={gage ? `Gage en attente${NBSP}: ${gage}` : 'Gage en attente'}
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
      subtitle="Accepte ou refuse d’une touche"
      color={other.color}
      onClick={() => setTab('settings', { anchor: ANCHORS.proposals })}
      wiggle
    />
  )
}
