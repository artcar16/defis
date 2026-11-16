/**
 * Logique d'affichage de la galerie (sans React) : ordre, compteurs, badge le
 * plus proche, et « évènements » de déblocage pour la cérémonie.
 */
import type { BadgeState, BadgeTier } from '../../core/badges'
import type { DayKey } from '../../core/types'
import { isBinary, isTiered, progressRatio } from './copy'

/** Ordre de la galerie : l'ordre officiel, les badges « pas concerné·e » à la fin. */
export function galleryOrder(badges: BadgeState[]): BadgeState[] {
  return [...badges.filter((b) => b.applicable), ...badges.filter((b) => !b.applicable)]
}

export interface ShowcaseCount {
  unlocked: number
  /** Badges qui concernent ce joueur. */
  total: number
}

export function showcaseCount(badges: BadgeState[]): ShowcaseCount {
  const applicable = badges.filter((b) => b.applicable)
  return { unlocked: applicable.filter((b) => b.unlocked).length, total: applicable.length }
}

/**
 * Le badge verrouillé le plus proche du déblocage (pour motiver). On ignore 🚀
 * (tout ou rien) et 🪶 (ça se joue à la pesée, pas au quotidien).
 */
export function closestBadge(badges: BadgeState[]): BadgeState | null {
  let best: BadgeState | null = null
  for (const b of badges) {
    if (!b.applicable || b.unlocked || isBinary(b) || isTiered(b) || b.progress.current <= 0) continue
    if (!best || progressRatio(b) > progressRatio(best)) best = b
  }
  return best
}

/** Un déblocage à fêter : un badge, ou un palier de 🪶 Plume. */
export interface UnlockEvent {
  /** Clé stable stockée une fois la cérémonie vue (« zen », « plume:5 »). */
  key: string
  badge: BadgeState
  tier: BadgeTier | null
  /** Rang du palier (0 = premier), -1 sans palier. */
  tierIndex: number
  on: DayKey
}

/** Tous les déblocages d'un joueur, du plus ancien au plus récent. */
export function unlockEvents(badges: BadgeState[]): UnlockEvent[] {
  const events: UnlockEvent[] = []
  for (const badge of badges) {
    if (!badge.applicable || !badge.unlocked) continue
    if (badge.tiers && badge.tiers.length > 0) {
      badge.tiers.forEach((tier, i) => {
        if (tier.unlockedOn) {
          events.push({ key: `${badge.id}:${tier.pct ?? i}`, badge, tier, tierIndex: i, on: tier.unlockedOn })
        }
      })
    } else if (badge.unlockedOn) {
      events.push({ key: badge.id, badge, tier: null, tierIndex: -1, on: badge.unlockedOn })
    }
  }
  return events.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
}
