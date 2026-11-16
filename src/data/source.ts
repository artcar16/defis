/**
 * Contrat entre les écrans et les données.
 * - Maquette : DemoSource (données fictives, en mémoire + localStorage).
 * - Étapes 4-5 : SupabaseSource (même interface, données réelles + temps réel).
 * Les écrans ne connaissent que cette interface.
 */
import type {
  CheckinValue,
  DayKey,
  DuelSnapshot,
  Habit,
  Player,
  PlayerId,
  ProposalPayload,
} from '../core/types'

/** Quelque chose vient de se passer (souvent côté adversaire) → petit toast. */
export interface Activity {
  kind:
    | 'checkin_done'
    | 'checkin'
    | 'weighin'
    | 'proposal'
    | 'proposal_accepted'
    | 'proposal_refused'
    | 'stake'
    | 'gage_paid'
    | 'profile'
  playerId: PlayerId
  /** Texte prêt à afficher, ex. « 👀 Laetitia vient de faire son check-in ». */
  text: string
}

export type ProfilePatch = Partial<Pick<Player, 'name' | 'emoji' | 'color' | 'showKg'>>
export type HabitLookPatch = Partial<Pick<Habit, 'name' | 'emoji' | 'hint'>>

export interface DuelSource {
  readonly mode: 'demo' | 'supabase'
  /** Données actuelles (déjà filtrées pour le joueur connecté : kilos de l'autre masqués). */
  getSnapshot(): DuelSnapshot
  /** Écoute les changements (temps réel). Renvoie la fonction de désabonnement. */
  subscribe(listener: (snapshot: DuelSnapshot, activity?: Activity) => void): () => void
  /** Heure actuelle (la démo peut voyager dans le temps). */
  now(): Date

  // ─── Actions du joueur connecté ───
  /** Remplit / corrige une habitude pour un jour (`null` = effacer). */
  setCheckin(day: DayKey, habitId: string, value: CheckinValue | null): Promise<void>
  /** Enregistre (ou corrige) la pesée du jour. */
  saveWeighIn(day: DayKey, weightKg: number): Promise<void>
  /** Prénom, avatar, couleur, montrer mes kilos : immédiat. */
  updateProfile(patch: ProfilePatch): Promise<void>
  /** Renommer une habitude / changer son emoji : immédiat (cosmétique). */
  updateHabitLook(habitId: string, patch: HabitLookPatch): Promise<void>
  /** Changement de règle : proposé, à faire accepter par l'autre. */
  propose(payload: ProposalPayload): Promise<void>
  answerProposal(proposalId: string, accept: boolean): Promise<void>
  cancelProposal(proposalId: string): Promise<void>
  /** Enjeu de la semaine (modifiable le lundi seulement). */
  setStake(weekStart: DayKey, stake: string): Promise<void>
  /** Liste des gages de la roulette. */
  setGages(gages: string[]): Promise<void>
  /** Valide (ou annule) « Gage payé ✅ » pour un joueur. */
  setGagePaid(weekStart: DayKey, playerId: PlayerId, paid: boolean): Promise<void>
  /** La cérémonie de cette manche a été vue. */
  markResultsSeen(weekStart: DayKey): Promise<void>
  signOut(): Promise<void>
}

/** Commandes réservées à la maquette (panneau 🧪 Démo dans les réglages). */
export interface DemoControls {
  /** Jouer en tant que l'autre joueur. */
  switchPlayer(playerId: PlayerId): void
  /** Simule le check-in de l'adversaire (pour voir le Ring bouger + le toast). */
  simulateOtherCheckin(): void
  /** Voyage dans le temps : choisit le jour « aujourd'hui » de la démo (régénère les données). */
  setToday(day: DayKey): void
  /** Le jour réel de la démo. */
  realToday(): DayKey
  /** Revoir la cérémonie de la dernière manche. */
  replayResults(): void
  /** Remet les données de démo à zéro. */
  reset(): void
}
