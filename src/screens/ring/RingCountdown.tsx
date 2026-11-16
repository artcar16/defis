/**
 * Avant le premier lundi : le Ring en mode « compte à rebours ».
 */
import { motion, useReducedMotion } from 'motion/react'
import { diffDays, isoDayName, weekStartOf } from '../../core/dates'
import { frDayMonth, NBSP, pluralWord } from '../../core/fr'
import { weighInDayFor } from '../../core/scoring'
import { useDuel } from '../../data/DuelProvider'
import { Card } from '../../ui/kit'
import { greetingLine } from './format'
import { ProposalBanner, Reveal, WeighInCard } from './RingCards'
import { Commentator } from './RingHero'
import { TugOfWar } from './TugOfWar'
import type { RingData } from './useRingData'

export function RingCountdown({ data }: { data: RingData }) {
  const { today, hour, snapshot, me, other } = useDuel()
  const reduced = useReducedMotion() ?? false
  // Le duel démarre le lundi de la semaine de seasonStart (comme buildSeason).
  const start = weekStartOf(snapshot.settings.seasonStart)
  const n = Math.max(1, diffDays(today, start))
  const weighDay = isoDayName(weighInDayFor(start, snapshot.settings))

  return (
    <div className="space-y-4">
      <Reveal index={0}>
        <header className="pt-1">
          <p className="truncate text-[15px] font-bold text-muted">{greetingLine(hour, me.name)}</p>
          <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight text-ink">🥊 Le duel approche{NBSP}!</h1>
        </header>
      </Reveal>

      {data.pendingProposals > 0 && (
        <Reveal index={1}>
          <ProposalBanner count={data.pendingProposals} />
        </Reveal>
      )}

      <Reveal index={1}>
        <section className="card overflow-hidden" aria-label="Compte à rebours">
          <div className="px-4 pt-5 text-center">
            <div className="font-display text-[14px] font-semibold tracking-wide text-muted uppercase">Coup d’envoi dans</div>
            <motion.div
              className="score-num mt-1 text-[92px] leading-[0.9]"
              style={{ color: 'var(--color-gold-dark)', textShadow: '0 5px 0 color-mix(in oklab, var(--color-gold) 45%, transparent)' }}
              animate={reduced ? undefined : { scale: [1, 1.06, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            >
              {n}
            </motion.div>
            <div className="font-display text-[24px] font-semibold text-ink">{pluralWord(n, 'jour')} ⏳</div>
            <div className="mt-1 text-[15px] font-semibold text-balance text-ink-soft">
              Lundi {frDayMonth(start, 'MMMM')}, minuit pile. {me.name} contre {other.name}
              {NBSP}!
            </div>
          </div>
          <TugOfWar
            left={me}
            right={other}
            leftStanding="even"
            lean={0}
            gap={0}
            bounceKey="0:0"
            pulse={null}
            calm
          />
          <Commentator text={`Échauffez-vous bien${NBSP}: dès lundi, chaque point compte 🔥`} reduced={reduced} />
        </section>
      </Reveal>

      <Reveal index={2}>
        {data.weighInDay ? (
          <WeighInCard data={data} />
        ) : (
          <Card className="flex items-center gap-3">
            <span className="emoji-xl shrink-0 text-[44px]!" aria-hidden="true">
              ⚖️
            </span>
            <p className="text-[15px] leading-snug text-ink-soft">
              <span className="font-display text-[17px] font-semibold text-ink">Conseil{NBSP}:</span> fais ta pesée de départ le {weighDay} d’avant, elle
              servira de référence 📍
            </p>
          </Card>
        )}
      </Reveal>
    </div>
  )
}
