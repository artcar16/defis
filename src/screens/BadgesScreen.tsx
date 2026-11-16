/**
 * 🏅 Écran Badges : la vitrine à trophées des deux joueurs (c'est un duel !).
 * - Bascule Moi / l'autre avec le compteur « 4 / 8 » de chacun.
 * - Galerie en 2 colonnes : médailles dorées une fois débloquées, grisées et
 *   cadenassées avec la progression sinon, « Pas concerné·e » à la fin.
 * - Cérémonie plein écran pour chaque badge pas encore fêté du joueur connecté.
 * Tout est calculé par computeBadges (core/badges.ts) à partir de useDuel().
 */
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { computeBadges, type BadgeState } from '../core/badges'
import type { Player, PlayerId } from '../core/types'
import { useDuel } from '../data/DuelProvider'
import { ScreenHeader, springy } from '../ui/kit'
import { useNav } from '../ui/nav'
import { BadgeDetail, type DetailProps } from './badges/BadgeDetail'
import { BadgeTile } from './badges/BadgeTile'
import { progressRatio, progressText, showcaseLine } from './badges/copy'
import { closestBadge, galleryOrder, showcaseCount } from './badges/model'
import { PlayerSwitch } from './badges/PlayerSwitch'
import { UnlockCelebration } from './badges/UnlockCelebration'
import { useUnseenUnlocks } from './badges/useUnseenUnlocks'

/** Petite pause avant la cérémonie, le temps que l'écran apparaisse. */
const CEREMONY_DELAY_MS = 500

export function BadgesScreen() {
  const { snapshot, season, today, me, other } = useDuel()
  const { sheet } = useNav()
  const reduced = useReducedMotion() ?? false

  const mine = useMemo(() => computeBadges(me.id, snapshot, season, today), [me.id, snapshot, season, today])
  const theirs = useMemo(() => computeBadges(other.id, snapshot, season, today), [other.id, snapshot, season, today])
  const myCount = showcaseCount(mine)
  const theirCount = showcaseCount(theirs)

  const [viewId, setViewId] = useState<PlayerId>(me.id)
  const viewingMe = viewId !== other.id
  const viewed = viewingMe ? me : other
  const badges = viewingMe ? mine : theirs
  const ordered = useMemo(() => galleryOrder(badges), [badges])
  const closest = closestBadge(badges)

  // Fiche détaillée.
  const [openId, setOpenId] = useState<string | null>(null)
  const openBadge = openId ? (badges.find((b) => b.id === openId) ?? null) : null
  const closeDetail = useCallback(() => setOpenId(null), [setOpenId])
  const detail: DetailProps | null = openBadge
    ? { badge: openBadge, player: viewed, isMe: viewingMe, today, daysLeftInWeek: season.current.daysLeft }
    : null

  // Cérémonie des nouveaux badges (joueur connecté uniquement), après une courte pause
  // et jamais par-dessus une autre feuille (résultats de la semaine, pesée).
  const { pending, dismiss } = useUnseenUnlocks(me.id, mine, today)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), CEREMONY_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [])
  const [celebrated, setCelebrated] = useState(0)
  const ceremony = armed && sheet === null && !openBadge ? (pending[0] ?? null) : null

  return (
    <div className="pb-2">
      <ScreenHeader
        title="Badges"
        emoji="🏅"
        subtitle={viewingMe ? 'Ta vitrine à trophées ✨' : `La vitrine de ${other.name} 👀`}
      />

      <PlayerSwitch
        value={viewed.id}
        onChange={(id) => {
          setViewId(id)
          setOpenId(null)
        }}
        options={[
          { player: me, label: 'Moi', count: myCount },
          { player: other, label: other.name, count: theirCount },
        ]}
      />

      <p className="mt-3 px-2 text-center text-[15px] leading-snug font-semibold text-balance text-ink-soft">
        {showcaseLine(other.name, myCount.unlocked, theirCount.unlocked)}
      </p>

      {closest && (
        <ClosestHint key={`hint-${viewed.id}`} badge={closest} mine={viewingMe} player={viewed} onOpen={() => setOpenId(closest.id)} />
      )}

      <motion.div
        key={`grid-${viewed.id}`}
        className="mt-4 grid grid-cols-2 gap-3"
        initial={reduced ? false : 'hidden'}
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.045 } } }}
      >
        {ordered.map((b, i) => (
          <BadgeTile key={b.id} badge={b} player={viewed} today={today} index={i} onOpen={() => setOpenId(b.id)} />
        ))}
      </motion.div>

      <BadgeDetail detail={detail} onClose={closeDetail} />

      <UnlockCelebration
        event={ceremony}
        position={celebrated + 1}
        total={celebrated + pending.length}
        player={me}
        otherName={other.name}
        today={today}
        onContinue={(e) => {
          dismiss(e.key)
          setCelebrated((n) => n + 1)
        }}
      />
    </div>
  )
}

/** « 🎯 Ton prochain badge : Frigo fermé 2 / 7 » — tap pour ouvrir la fiche. */
function ClosestHint({
  badge,
  mine,
  player,
  onOpen,
}: {
  badge: BadgeState
  mine: boolean
  player: Player
  onOpen: () => void
}) {
  const text = progressText(badge)
  const pct = Math.round(progressRatio(badge) * 100)
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.97 }}
      transition={springy}
      aria-haspopup="dialog"
      className="mt-3 flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-sunken py-2.5 pr-3 pl-2.5 text-left"
    >
      <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-surface text-[26px] leading-none shadow-[var(--shadow-card)]" aria-hidden="true">
        {badge.emoji}
        <span className="absolute -right-1 -bottom-1 text-base">🎯</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[14px] leading-tight font-bold text-muted">
            {mine ? 'Ton prochain badge' : `Le prochain de ${player.name}`}
          </span>
          {text && (
            <span className="shrink-0 text-[14px] leading-tight font-bold text-muted">
              <span className="score-num text-[16px] text-ink">{text.value}</span> {text.unit}
            </span>
          )}
        </span>
        <span className="truncate font-display text-[17px] leading-tight font-semibold text-ink">{badge.name}</span>
        <span className="block h-2 w-full overflow-hidden rounded-full bg-surface">
          <motion.span
            className="block h-full rounded-full"
            style={{ background: player.color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(pct, 4)}%` }}
            transition={{ type: 'spring', stiffness: 140, damping: 20, delay: 0.2 }}
          />
        </span>
      </span>
      <span className="text-2xl leading-none text-muted" aria-hidden="true">
        ›
      </span>
    </motion.button>
  )
}
