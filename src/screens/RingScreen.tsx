/**
 * 🥊 Le Ring (accueil) : les deux joueurs face à face, le tir à la corde, la phrase
 * taquine, le statut du jour, l'enjeu, le bilan, et le gros bouton « Mon check-in ».
 * Se met à jour en direct quand l'autre joue (via useDuel()).
 */
import { useState } from 'react'
import { useDuel } from '../data/DuelProvider'
import { activityEmoji } from './ring/format'
import {
  CheckinCta,
  GageBanner,
  LastRoundTile,
  ProposalBanner,
  RecordTile,
  Reveal,
  RingHeader,
  StakeCard,
  WeighInCard,
} from './ring/RingCards'
import { RingCountdown } from './ring/RingCountdown'
import { RingHero } from './ring/RingHero'
import type { ArenaPulse } from './ring/TugOfWar'
import { useRingData } from './ring/useRingData'


export function RingScreen() {
  const { season, lastActivity, other } = useDuel()
  const data = useRingData()

  // Petite onde côté adversaire quand il vient de jouer (seulement pour ce qui arrive pendant qu'on regarde).
  const [mountedAt] = useState(() => Date.now())
  const pulse: ArenaPulse | null =
    lastActivity && lastActivity.playerId === other.id && lastActivity.at >= mountedAt
      ? { key: lastActivity.at, emoji: activityEmoji(lastActivity.kind) }
      : null

  if (season.notStarted) return <RingCountdown data={data} />

  let i = 0
  return (
    <div className="space-y-4">
      <Reveal index={i++}>
        <RingHeader />
      </Reveal>

      <RingHero data={data} pulse={pulse} />

      <Reveal index={i++}>
        <CheckinCta data={data} />
      </Reveal>

      {data.weighInDay && (
        <Reveal index={i++}>
          <WeighInCard data={data} />
        </Reveal>
      )}

      {data.pendingProposals > 0 && (
        <Reveal index={i++}>
          <ProposalBanner count={data.pendingProposals} />
        </Reveal>
      )}

      <Reveal index={i++}>
        <StakeCard />
      </Reveal>

      <Reveal index={i++}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 items-stretch gap-3">
            <RecordTile />
            <LastRoundTile />
          </div>
          <GageBanner />
        </div>
      </Reveal>
    </div>
  )
}
