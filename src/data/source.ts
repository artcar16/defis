/**
 * Contrat entre les écrans et les données.
 * - Maquette : DemoSource (données fictives, en mémoire + localStorage).
 * - Étapes 4-5 : SupabaseSource (même interface, données réelles + temps réel).
 * Les écrans ne connaissent que cette interface.
 *
 * Garanties qu'une source DOIT tenir (les écrans en dépendent) :
 * 1. Mise à jour optimiste : chaque action applique son effet au snapshot local et
 *    notifie les abonnés AVANT de résoudre sa promesse. En cas d'échec, elle annule
 *    l'effet, notifie, puis rejette avec un message en français prêt à afficher.
 * 2. Le snapshot contient toujours exactement 2 joueurs et un `meId` valide.
 * 3. Le snapshot est déjà filtré pour le joueur connecté : kilos de l'autre (pesées,
 *    objectif, propositions d'objectif) à null et ses % arrondis (./mask.ts : des % exacts
 *    redonneraient ses kilos), sauf s'il a choisi de montrer ses kilos.
 * 4. `activity` ne signale que ce qu'a fait l'AUTRE joueur (jamais l'écho de mes actions).
 * 5. Une manche commencée a toujours un enjeu : s'il manque et que
 *    RULES.stake.autoDrawOnMonday est vrai, la source le tire avec drawStake()
 *    (core/stake.ts, tirage déterministe : les deux téléphones tirent le même gage).
 * 6. Une seule proposition en attente par auteur et par sujet : proposer à nouveau
 *    (même `kind` ; pour habit_disable / habit_kind, la même habitude, quel que soit le
 *    kind) remplace l'ancienne. Accepter une proposition sur une habitude déjà close est
 *    refusé. Si RULES.proposals.requireApproval est faux, elle est acceptée d'office.
 * 7. Connexion par prénom + code (décision 20 de SPEC.md) : pas d'email. Tant que
 *    `loading` est vrai, `getSnapshot()` renvoie un snapshot de départ (joueurs et
 *    réglages par défaut, aucune donnée) : les écrans affichent un écran d'attente (avec
 *    `problem` s'il y en a un, ex. téléphone déjà connecté mais serveur injoignable : on
 *    attend, on ne redemande pas le code).
 */
import type {
  BadgeUnlock,
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

/** Un joueur tel que l'écran de connexion le montre (avant d'être connecté). */
export interface LoginPlayer {
  id: PlayerId
  name: string
  emoji: string
  color: string
  /** Un code a déjà été choisi pour ce prénom (sinon : « Choisis ton code »). */
  hasCode: boolean
}

/** Longueur du code secret (que des chiffres). */
export const CODE_LENGTH = 6

export type ProfilePatch = Partial<Pick<Player, 'name' | 'emoji' | 'color' | 'showKg'>>
export type HabitLookPatch = Partial<Pick<Habit, 'name' | 'emoji' | 'hint'>>

export interface DuelSource {
  readonly mode: 'demo' | 'supabase'
  /** Premier chargement en cours (session, données) : afficher un écran d'attente. */
  readonly loading: boolean
  /**
   * Problème bloquant, en français, prêt à afficher (ex. « La base n’est pas prête : lance
   * le script SQL »). null si tout va bien. Notifié via subscribe.
   */
  readonly problem: string | null
  /** Le joueur est-il connecté ? (notifié via subscribe quand ça change) */
  readonly signedIn: boolean
  /** Les deux prénoms pour l'écran de connexion (rejette avec un message en français). */
  loginPlayers(): Promise<LoginPlayer[]>
  /**
   * Connexion : prénom + code à CODE_LENGTH chiffres. Si ce prénom n'a pas encore de code,
   * celui-ci devient le sien. Rejette avec un message en français (code faux, trop d'essais…).
   */
  signIn(playerId: PlayerId, code: string): Promise<void>
  /**
   * Change le code du joueur connecté (rejette avec un message en français si l'ancien est
   * faux). Ses AUTRES téléphones sont déconnectés ; celui-ci reste connecté.
   */
  changeCode(oldCode: string, newCode: string): Promise<void>
  /**
   * « Débloquer mon prénom » : efface les codes faux tapés pour le joueur connecté (sur
   * l'écran de connexion d'un autre téléphone). Renvoie combien il y en avait récemment.
   */
  unlockCode(): Promise<number>
  /** « Réessayer » : relance tout de suite un démarrage raté ou bloqué, ou relit le duel. */
  retry(): void
  /** Coupe tout (temps réel, minuteurs) : la source n'est plus utilisée. */
  dispose(): void
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
  /** Enregistre des badges débloqués par le joueur connecté (voir badgeUnlocksToRecord). */
  recordBadgeUnlocks(unlocks: BadgeUnlock[]): Promise<void>
  /** Ces célébrations de badges ont été vues par le joueur connecté. */
  markBadgesSeen(keys: string[]): Promise<void>
  /** « Se déconnecter » : ce téléphone oublie le joueur (il faudra retaper le code). */
  signOut(): Promise<void>
}

/** Commandes réservées à la maquette (panneau 🧪 Démo dans les réglages). */
export interface DemoControls {
  /** « Jouer en tant que » (écran de connexion de la démo). */
  signInAs(playerId: PlayerId): void
  /** Jours où l'on peut voyager : la vraie semaine + le lundi suivant. */
  travelDays(): DayKey[]
  /** Jouer en tant que l'autre joueur. */
  switchPlayer(playerId: PlayerId): void
  /** Simule le check-in de l'adversaire (pour voir le Ring bouger + le toast). */
  simulateOtherCheckin(): void
  /**
   * Voyage dans le temps : choisit le jour « aujourd'hui » de la démo. Garde tout ce que
   * le joueur a fait ; seuls les jours manquants sont inventés (et pas hier pour moi, pour
   * pouvoir montrer le rattrapage). Revenir en arrière efface ce qui est après le jour choisi.
   */
  setToday(day: DayKey): void
  /** Le jour réel de la démo. */
  realToday(): DayKey
  /** Revoir la cérémonie de la dernière manche. */
  replayResults(): void
  /** Remet les données de démo à zéro. */
  reset(): void
}
