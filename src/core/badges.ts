/**
 * 🏅 Badges, calculés à partir des données (rien n'est stocké). Module pur.
 *
 * TODO(agent core) : implémentation complète de computeBadges + tests (src/core/badges.test.ts).
 */
import { RULES, type Rules } from '../config/rules'
import type { Season } from './season'
import type { DayKey, DuelSnapshot, PlayerId } from './types'

export type BadgeId =
  | 'manucure'
  | 'zen'
  | 'frigo'
  | 'machine'
  | 'assidu'
  | 'plume'
  | 'remontada'
  | 'royale'
  | 'inarretable'

export interface BadgeDef {
  id: BadgeId
  emoji: string
  name: string
  /** Condition, en français, affichée dans la galerie. */
  description: string
}

export const BADGES: BadgeDef[] = [
  { id: 'manucure', emoji: '💅', name: 'Manucure intacte', description: '7 jours d’affilée sans se ronger les ongles' },
  { id: 'zen', emoji: '🧘', name: 'Zen absolu', description: '7 jours d’affilée sans se gratter' },
  { id: 'frigo', emoji: '🔒', name: 'Frigo fermé', description: '7 jours d’affilée sans grignoter' },
  { id: 'machine', emoji: '🏋️', name: 'Machine', description: 'Sport 5 jours dans la même semaine' },
  { id: 'assidu', emoji: '📅', name: 'Assidu·e', description: 'Check-in complet 7 jours d’affilée' },
  { id: 'plume', emoji: '🪶', name: 'Plume', description: '−2 % depuis le départ, puis −5 % et −10 %' },
  { id: 'remontada', emoji: '🚀', name: 'Remontada', description: 'Gagner une manche en étant mené·e le jeudi soir' },
  { id: 'royale', emoji: '👑', name: 'Série royale', description: '3 manches gagnées d’affilée' },
  { id: 'inarretable', emoji: '🔥', name: 'Inarrêtable', description: '30 jours d’affilée « nickel » sur une même habitude à éviter' },
]

export interface BadgeTier {
  /** Ex. « −2 % ». */
  label: string
  unlockedOn: DayKey | null
}

export interface BadgeState extends BadgeDef {
  /** Le badge concerne-t-il ce joueur ? (ex. 🧘 Zen absolu sans habitude « grattage » → non) */
  applicable: boolean
  unlocked: boolean
  /** Premier jour où la condition a été remplie. */
  unlockedOn: DayKey | null
  /** Progression vers le (prochain) déblocage, ex. 4 / 7. */
  progress: { current: number; target: number }
  /** Paliers (🪶 Plume uniquement). */
  tiers?: BadgeTier[]
  /** Nombre de fois obtenu (ex. 🏋️ Machine plusieurs semaines). */
  count: number
}

/** Calcule l'état de tous les badges d'un joueur. */
export function computeBadges(
  playerId: PlayerId,
  snapshot: DuelSnapshot,
  season: Season,
  today: DayKey,
  rules: Rules = RULES,
): BadgeState[] {
  void playerId
  void snapshot
  void season
  void today
  void rules
  // Implémentation provisoire : tout est verrouillé.
  return BADGES.map((b) => ({
    ...b,
    applicable: true,
    unlocked: false,
    unlockedOn: null,
    progress: { current: 0, target: 7 },
    count: 0,
  }))
}
