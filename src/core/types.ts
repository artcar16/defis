/**
 * Types du domaine. Module pur : aucune dépendance à React, à la base ou au navigateur.
 */

/** Un jour calendaire à Paris, au format 'YYYY-MM-DD'. */
export type DayKey = string

export type PlayerId = string

/**
 * 'avoid' = à éviter (3 états : Nickel, Un peu, Craquage) ;
 * 'avoid_strict' = à éviter, tout ou rien (2 états : Nickel ou Craquage, pas de « Un peu ») ;
 * 'do' = à faire (2 états : Fait, Pas fait).
 */
export type HabitKind = 'avoid' | 'avoid_strict' | 'do'

export type AvoidValue = 'nickel' | 'unpeu' | 'craquage'
export type DoValue = 'fait' | 'pasfait'
export type CheckinValue = AvoidValue | DoValue

/** Habitudes de départ reconnues par les badges. */
export type BadgeHabitKey = 'ongles' | 'grattage' | 'grignotage' | 'sport'

export interface Player {
  id: PlayerId
  name: string
  /** Emoji avatar. */
  emoji: string
  /** Couleur du joueur (hex), utilisée partout : avatar, barres, courbes. */
  color: string
  /** « Montrer mes kilos à l'autre ». */
  showKg: boolean
  /**
   * Poids objectif en kg. `null` si non défini, ou si c'est l'autre joueur
   * et qu'il ne montre pas ses kilos.
   */
  goalKg: number | null
  /** Objectif exprimé en % par rapport à la première pesée (ex. -6). Toujours visible. */
  goalFromStartPct: number | null
}

export interface Habit {
  id: string
  playerId: PlayerId
  name: string
  /** Petite précision affichée sous le nom (ex. « En dehors des repas »). */
  hint: string
  emoji: string
  kind: HabitKind
  badgeKey: BadgeHabitKey | null
  /** Premier jour où l'habitude compte (inclus). */
  activeFrom: DayKey
  /** Premier jour où elle ne compte plus (exclu), ou `null` si toujours active. */
  activeUntil: DayKey | null
  sortOrder: number
}

export interface Checkin {
  playerId: PlayerId
  habitId: string
  day: DayKey
  value: CheckinValue
  /** Horodatage ISO de la dernière modification. */
  updatedAt: string
}

/**
 * Une pesée. Les champs en % sont toujours présents (calculés côté données) :
 * ils suffisent pour scorer et pour les courbes, sans révéler les kilos de l'autre.
 */
export interface WeighIn {
  playerId: PlayerId
  day: DayKey
  /** Poids en kg, `null` si masqué (pesée de l'autre qui ne montre pas ses kilos). */
  weightKg: number | null
  /** Variation en % depuis la pesée précédente (négatif = perte). `null` pour la toute première. */
  changePct: number | null
  /** Variation en % depuis la première pesée (0 pour la première). */
  fromStartPct: number
  /** Écart en % au poids objectif valable ce jour-là, `null` sans objectif. */
  goalDistancePct: number | null
}

export interface WeekMeta {
  /** Lundi de la manche. */
  weekStart: DayKey
  /** Enjeu / gage de la semaine. */
  stake: string | null
  /** Qui a payé son gage (validé par l'autre). */
  gagePaid: Record<PlayerId, boolean>
}

/** Jour de la pesée (1 = lundi … 7 = dimanche) en vigueur à partir d'une date. */
export interface WeighInDayRule {
  from: DayKey
  isoDay: number
}

export interface GameSettings {
  /** Lundi de la première manche. */
  seasonStart: DayKey
  /** Historique des jours de pesée (le plus récent applicable gagne). */
  weighInDays: WeighInDayRule[]
  /** Liste des gages pour la roulette. */
  gages: string[]
}

export type ProposalPayload =
  | { kind: 'habit_add'; name: string; emoji: string; hint: string; habitKind: HabitKind }
  | { kind: 'habit_disable'; habitId: string }
  | { kind: 'habit_kind'; habitId: string; habitKind: HabitKind }
  | { kind: 'weigh_day'; isoDay: number }
  /**
   * Nouvel objectif de poids (ou retrait si `clear`). L'autre ne voit que le % depuis le
   * départ : dans SON snapshot, `goalKg` vaut null (sauf si l'auteur montre ses kilos).
   * Avec Supabase, les kg restent dans une table lisible par l'auteur seul.
   */
  | { kind: 'goal_weight'; clear: boolean; goalKg: number | null; goalFromStartPct: number | null }

export type ProposalStatus = 'pending' | 'accepted' | 'refused' | 'cancelled'

export interface Proposal {
  id: string
  authorId: PlayerId
  payload: ProposalPayload
  status: ProposalStatus
  createdAt: string
  decidedAt: string | null
  /** Lundi à partir duquel le changement s'applique (renseigné à l'acceptation). */
  effectiveFrom: DayKey | null
}

/** Toutes les données du duel, telles que vues par le joueur connecté. */
export interface DuelSnapshot {
  meId: PlayerId
  players: Player[]
  habits: Habit[]
  checkins: Checkin[]
  weighIns: WeighIn[]
  weeks: WeekMeta[]
  settings: GameSettings
  proposals: Proposal[]
  /** Manches dont le joueur connecté a déjà vu la cérémonie (lundis). */
  seenResults: DayKey[]
  /**
   * Badges enregistrés comme débloqués (des deux joueurs). Un badge débloqué le reste,
   * même si une correction autorisée (aujourd'hui, hier, pesée du jour) repasse sous le seuil.
   */
  badgeUnlocks: BadgeUnlock[]
  /** Célébrations de badges déjà vues par le joueur connecté (clés de useUnseenUnlocks). */
  seenBadges: string[]
}

/** Un badge (ou un palier) obtenu, enregistré pour ne plus jamais le perdre. */
export interface BadgeUnlock {
  playerId: PlayerId
  /** Identifiant du badge (BadgeId de core/badges.ts). */
  badgeId: string
  /** Palier (🪶 Plume : % de perte, ex. 2 pour −2 %) ; null pour les autres badges. */
  tier: number | null
  /** Jour de la première obtention. */
  day: DayKey
}
