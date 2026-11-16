/**
 * Fiche d'un badge (au tap dans la galerie) : feuille qui monte du bas, avec la
 * médaille en grand, l'état, la progression, les paliers et « Comment l'obtenir ? ».
 * Se ferme au tap sur le fond, avec ✕, Échap, ou en la tirant vers le bas.
 */
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react'
import { useId } from 'react'
import type { BadgeState } from '../../core/badges'
import type { DayKey, Player } from '../../core/types'
import { Button, Pill } from '../../ui/kit'
import {
  HOW_TO,
  isBinary,
  isTiered,
  notApplicableText,
  plural,
  progressCaption,
  progressRatio,
  progressText,
  remainingText,
  shortDate,
  unlockedLabel,
} from './copy'
import { Medal } from './Medal'
import { Portal, useModalBehavior } from './Overlay'
import { Rays } from './Rays'

export interface DetailProps {
  badge: BadgeState
  player: Player
  /** Le joueur connecté regarde son propre badge. */
  isMe: boolean
  today: DayKey
  /** Jours restants dans la manche en cours (aujourd'hui compris). */
  daysLeftInWeek: number
}

export function BadgeDetail({ detail, onClose }: { detail: DetailProps | null; onClose: () => void }) {
  return (
    <Portal>
      <AnimatePresence>{detail && <DetailSheet key={`${detail.player.id}-${detail.badge.id}`} {...detail} onClose={onClose} />}</AnimatePresence>
    </Portal>
  )
}

function DetailSheet({ badge, player, isMe, today, daysLeftInWeek, onClose }: DetailProps & { onClose: () => void }) {
  useModalBehavior(true, onClose)
  const reduced = useReducedMotion() ?? false
  const drag = useDragControls()
  const titleId = useId()
  const state = !badge.applicable ? 'na' : badge.unlocked ? 'unlocked' : 'locked'
  const who = isMe ? null : player.name

  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <motion.div
        className="absolute inset-0"
        style={{ background: 'color-mix(in oklab, var(--color-ink) 42%, transparent)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative mx-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[32px] bg-surface shadow-[var(--shadow-pop)]"
        initial={reduced ? { opacity: 0 } : { y: '100%' }}
        animate={reduced ? { opacity: 1 } : { y: 0 }}
        exit={reduced ? { opacity: 0 } : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        drag="y"
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 700) onClose()
        }}
      >
        <motion.button
          type="button"
          onClick={onClose}
          whileTap={{ scale: 0.85 }}
          className="absolute top-3 right-3 z-10 grid size-12 place-items-center rounded-full bg-surface text-xl font-bold text-ink shadow-[var(--shadow-card)]"
          aria-label="Fermer"
        >
          ✕
        </motion.button>

        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Zone de prise : poignée + médaille (on la tire vers le bas pour fermer). */}
          <div
            className="relative touch-none overflow-hidden pb-3"
            onPointerDown={(e) => drag.start(e)}
            style={
              state === 'unlocked'
                ? { background: 'linear-gradient(180deg, color-mix(in oklab, var(--color-gold) 22%, var(--color-surface)), var(--color-surface))' }
                : undefined
            }
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1.5 w-12 rounded-full bg-line" />
            </div>

            <div className="relative mx-auto mt-3 grid h-[150px] w-full place-items-center">
              {state === 'unlocked' && <Rays size={330} glow={player.color} strength={30} duration={36} />}
              <motion.div
                initial={reduced ? false : { scale: 0.5, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.08 }}
              >
                <Medal emoji={badge.emoji} state={state} color={player.color} size="lg" count={isTiered(badge) ? 0 : badge.count} />
              </motion.div>
            </div>

            <div className="relative mt-1 flex flex-col items-center gap-2 px-6 text-center">
              <h2 id={titleId} className="font-display text-[28px] leading-tight font-bold text-ink">
                {badge.name}
              </h2>
              <Pill color={player.color}>
                <span aria-hidden="true">{player.emoji}</span> {isMe ? 'Ma vitrine' : `La vitrine de ${player.name}`}
              </Pill>
            </div>
          </div>

          <div className="px-5 pt-2">
          <StatusBox badge={badge} state={state} player={player} who={who} today={today} daysLeftInWeek={daysLeftInWeek} />

          {isTiered(badge) && badge.applicable && <TierList badge={badge} today={today} />}

          <section className="mt-5">
            <h3 className="font-display text-lg font-semibold text-ink-soft">Comment l’obtenir ? 🧐</h3>
            <p className="mt-1.5 text-[16px] leading-snug font-bold text-ink">{badge.description}</p>
            <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">{HOW_TO[badge.id]}</p>
          </section>

          <div className="mt-6 mb-2">
            <Button block size="lg" color={player.color} onClick={onClose}>
              {state === 'unlocked' ? 'Trop classe 😎' : 'Compris 👌'}
            </Button>
          </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function StatusBox({
  badge,
  state,
  player,
  who,
  today,
  daysLeftInWeek,
}: {
  badge: BadgeState
  state: 'unlocked' | 'locked' | 'na'
  player: Player
  who: string | null
  today: DayKey
  daysLeftInWeek: number
}) {
  if (state === 'na') {
    return (
      <div className="mt-2 rounded-[22px] bg-sunken p-4 text-center">
        <div className="font-display text-lg font-semibold text-ink-soft">🤷 Pas concerné·e</div>
        <p className="mt-1 text-[15px] leading-snug text-muted">{notApplicableText(badge.id, who)}</p>
      </div>
    )
  }

  if (state === 'unlocked') {
    const moreTiers = isTiered(badge) && badge.count < (badge.tiers?.length ?? 0)
    return (
      <>
        <div
          className="mt-2 flex flex-col items-center gap-1 rounded-[22px] p-4 text-center"
          style={{ background: 'color-mix(in oklab, var(--color-gold) 16%, transparent)' }}
        >
          <div className="font-display text-xl font-semibold text-ink">
            ✅ {badge.unlockedOn ? unlockedLabel(badge.unlockedOn, today, true) : 'Débloqué'}
          </div>
          {badge.count > 1 && !isTiered(badge) && (
            <div className="text-[15px] font-bold text-ink-soft">
              🔁 Obtenu <span className="score-num">{plural(badge.count, 'fois', 'fois')}</span>
            </div>
          )}
          {isTiered(badge) && (
            <div className="text-[15px] font-bold text-ink-soft">
              {plural(badge.count, 'palier atteint', 'paliers atteints')} sur {badge.tiers?.length ?? 0}
            </div>
          )}
        </div>
        {moreTiers && <ProgressBlock badge={badge} player={player} who={who} daysLeftInWeek={daysLeftInWeek} />}
      </>
    )
  }

  return <ProgressBlock badge={badge} player={player} who={who} daysLeftInWeek={daysLeftInWeek} />
}

function ProgressBlock({
  badge,
  player,
  who,
  daysLeftInWeek,
}: {
  badge: BadgeState
  player: Player
  who: string | null
  daysLeftInWeek: number
}) {
  const reduced = useReducedMotion() ?? false
  const text = progressText(badge)
  const pct = Math.round(progressRatio(badge) * 100)
  return (
    <div className="mt-2 rounded-[22px] bg-sunken p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold text-muted">{progressCaption(badge.id)}</span>
        {text && (
          <span className="shrink-0 font-bold whitespace-nowrap text-muted">
            <span className="score-num text-2xl text-ink">{text.value}</span> {text.unit}
          </span>
        )}
      </div>
      {!isBinary(badge) && (
        <div
          className="mt-2.5 h-3.5 overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Progression"
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: player.color }}
            initial={reduced ? false : { width: 0 }}
            animate={{ width: `${pct > 0 ? Math.max(pct, 5) : 0}%` }}
            transition={{ type: 'spring', stiffness: 140, damping: 20, delay: 0.25 }}
          />
        </div>
      )}
      <p className="mt-2.5 text-[15px] leading-snug font-semibold text-ink-soft">{remainingText(badge, who, daysLeftInWeek)}</p>
    </div>
  )
}

function TierList({ badge, today }: { badge: BadgeState; today: DayKey }) {
  return (
    <section className="mt-5">
      <h3 className="font-display text-lg font-semibold text-ink-soft">Les paliers 🪜</h3>
      <ol className="mt-2 flex flex-col gap-2">
        {(badge.tiers ?? []).map((t, i) => {
          const done = t.unlockedOn !== null
          return (
            <li
              key={t.label}
              className="flex min-h-14 items-center gap-3 rounded-[20px] px-3 py-2"
              style={
                done
                  ? { background: 'color-mix(in oklab, var(--color-gold) 18%, transparent)' }
                  : { boxShadow: 'inset 0 0 0 2px var(--color-line)' }
              }
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-full text-xl"
                style={
                  done
                    ? { background: 'linear-gradient(180deg, color-mix(in oklab, var(--color-gold) 50%, white), var(--color-gold))', boxShadow: '0 3px 0 var(--color-gold-dark)' }
                    : { background: 'var(--color-sunken)', filter: 'grayscale(1)', opacity: 0.6 }
                }
                aria-hidden="true"
              >
                {badge.emoji}
              </span>
              <span className="flex-1">
                <span className="block font-display text-[17px] font-semibold text-ink">
                  Palier {i + 1} · <span className="score-num">{t.label}</span>
                </span>
                <span className="block text-[14px] font-bold text-muted">
                  {t.unlockedOn ? (t.unlockedOn === today ? 'Atteint aujourd’hui 🎉' : `Atteint le ${shortDate(t.unlockedOn)}`) : 'Pas encore'}
                </span>
              </span>
              <span className="text-xl" aria-hidden="true">
                {done ? '✅' : '🔒'}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
