/**
 * 📜 CONTRAT entre l'app et la base Supabase (supabase/migrations/0001_duel.sql).
 *
 * Toute modification ici doit être faite des deux côtés : le SQL et SupabaseSource.
 *
 * ─── Modèle de sécurité (décision 20 de SPEC.md) ────────────────────────────
 * - Pas d'email : chaque téléphone ouvre une session Supabase ANONYME
 *   (supabase.auth.signInAnonymously), puis la « lie » à un joueur avec claim_player
 *   (prénom + code à 6 chiffres). Une session non liée n'a accès à rien.
 * - Les données vivent dans le schéma `duel`, que l'API n'expose PAS. RLS y est activé
 *   sans aucune règle (défense en profondeur) et aucun droit n'est donné à anon /
 *   authenticated. Seul moyen d'y toucher : les fonctions RPC ci-dessous (schéma public,
 *   SECURITY DEFINER, search_path vide), qui vérifient qui joue, appliquent les règles du
 *   jeu (mêmes règles que src/core et src/config/rules.ts) et masquent les kilos de l'autre.
 * - Une seule table lisible par l'app : `public.events` (journal pour le temps réel),
 *   lisible seulement par une session liée à un joueur, sans aucune donnée privée.
 * - Dépannage hors de l'app (SQL Editor de Supabase) : duel.reset_code(joueur, code) pose
 *   un code et déconnecte tous les téléphones de ce joueur (README, « Code oublié »).
 *
 * ─── Erreurs ────────────────────────────────────────────────────────────────
 * - Règle du jeu / saisie refusée : SQLSTATE 'P0001', message en français prêt à
 *   afficher (avec emoji), ex. « Ce jour n’est plus modifiable 🔒 ».
 * - Session non liée à un joueur : SQLSTATE '28000', message « Connecte-toi d’abord 🔑 ».
 *   Pas de session du tout (supabase-js envoie alors la clé publishable : rôle anon) :
 *   PostgREST répond '42501' (pas le droit d'exécuter la fonction), sauf login_players.
 *   Dans les deux cas, SupabaseSource repasse en « déconnecté ».
 * - Trop d'essais de code : SQLSTATE 'P0001', message qui dit d'attendre.
 * - Fonction absente (script SQL pas lancé) : PostgREST répond PGRST202 → `problem`.
 * - Clé publishable refusée (mauvaise variable sur Vercel) : la passerelle répond 401
 *   « Invalid API key », sans SQLSTATE → `problem` qui dit quoi vérifier, sans réessayer.
 *
 * ─── Horloge ────────────────────────────────────────────────────────────────
 * Le serveur juge « aujourd'hui » à Paris : duel.today() = (duel.now() at time zone
 * 'Europe/Paris')::date. duel.now() renvoie now() ; les tests la remplacent.
 *
 * ─── Règles dupliquées côté serveur ─────────────────────────────────────────
 * Table duel.rules (une ligne), recopiée de RULES (un test vérifie qu'elles sont égales) :
 * catch_up_days (checkin.catchUpDays), catch_up_across_weeks (checkin.catchUpAcrossWeeks),
 * only_on_weigh_in_day, default_weigh_day (weighIn.defaultDay), min_kg, max_kg,
 * stake_editable_days (stake.editableDays), code_max_failures (10), code_lock_minutes (15),
 * require_approval (proposals.requireApproval), weigh_max_points (weighIn.maxPoints),
 * full_points_loss_pct (weighIn.fullPointsLossPct), goal_tolerance_pct (weighIn.goalTolerancePct).
 *
 * ─── Ce que l'autre voit de mes % (décision 18, garantie 3) ─────────────────
 * Si je ne montre pas mes kilos, mes % exacts suffiraient à les recalculer (seuls quelques
 * poids au dixième de kg redonnent exactement les mêmes float8). L'autre reçoit donc des %
 * ARRONDIS, choisis pour que l'app en déduise exactement la même chose que mon téléphone :
 * - changePct : perte entre 0 et le plein → au centième (les points de pesée, déjà publics
 *   via le score) ; sinon au dixième, sans jamais changer les points (duel.mask_change) ;
 * - fromStartPct : au dixième vers zéro (mêmes paliers et même progression 🪶) ;
 * - goalDistancePct (pas affiché) : 0 dans la zone objectif (isInGoalZone), sinon le % entier
 *   vers l'extérieur ;
 * - goalFromStartPct (joueur et propositions d'objectif) : au demi-%.
 * Ce qui reste visible par nature : les points de pesée (le score est public).
 * Les miens, et ceux de l'autre s'il montre ses kilos, restent exacts au bit près.
 */
import type { BadgeUnlock, CheckinValue, DayKey, DuelSnapshot, PlayerId, ProposalPayload } from '../../core/types'
import type { LoginPlayer } from '../source'

/** Codes d'erreur (SQLSTATE) renvoyés par les fonctions. */
export const SQLSTATE = {
  /** Règle du jeu ou saisie refusée : `message` est en français, prêt à afficher. */
  rule: 'P0001',
  /** Session pas liée à un joueur. */
  notMember: '28000',
  /** Pas de session (rôle anon) : la fonction n'est pas exécutable. Traité comme notMember. */
  noSession: '42501',
} as const

/** Code PostgREST quand une fonction n'existe pas (script SQL pas encore lancé). */
export const PGRST_NO_FUNCTION = 'PGRST202'

/**
 * Les fonctions RPC : nom → paramètres (noms SQL exacts, préfixe p_) et valeur renvoyée.
 * Les dates sont des chaînes 'YYYY-MM-DD' (DayKey), les ids d'habitude des uuid en texte.
 */
export interface DuelRpc {
  // ─── Connexion (appelables sans être lié ; login_players aussi sans session) ───

  /** Les deux joueurs (ordre d'affichage) et s'ils ont déjà un code. */
  login_players: { args: Record<string, never>; returns: LoginPlayer[] }
  /**
   * Lie la session courante (anonyme) au joueur. Premier code pour ce prénom → il devient
   * le sien (`created` = true). Code faux → P0001 « Code incorrect 🙅 » (et compte l'échec).
   * Plus de code_max_failures échecs en code_lock_minutes sur ce prénom → P0001 qui dit
   * d'attendre, même avec le bon code. Plusieurs téléphones par joueur : OK.
   * Format : exactement 6 chiffres, sinon P0001.
   */
  claim_player: { args: { p_player: PlayerId; p_code: string }; returns: { created: boolean } }
  /**
   * Change le code du joueur lié (l'ancien doit être bon : sinon P0001, compté comme échec).
   * Le verrou ne compte ici que les erreurs de CETTE session (un inconnu qui s'acharne sur
   * l'écran de connexion n'empêche pas de changer son code). Les AUTRES téléphones du joueur
   * sont déconnectés (28000 à leur prochain appel) ; celui-ci reste connecté.
   */
  change_code: { args: { p_old: string; p_new: string }; returns: null }
  /**
   * « Débloquer mon prénom » (session liée) : efface les codes faux du joueur lié, ceux d'un
   * inconnu compris. Renvoie combien il y en avait dans la fenêtre du verrou.
   */
  clear_code_failures: { args: Record<string, never>; returns: number }
  /** « Se déconnecter » : délie cette session (les autres téléphones restent connectés). */
  release_device: { args: Record<string, never>; returns: null }

  // ─── Lecture (session liée) ───

  /**
   * Tout le duel, déjà filtré pour le joueur lié — exactement la forme DuelSnapshot
   * (clés camelCase). Masquage (garantie 3 de source.ts, décisions 18) :
   * - players[].goalKg : objectif en vigueur aujourd'hui ; null pour l'autre sauf s'il
   *   montre ses kilos (showKg). goalFromStartPct = percentChange(1re pesée, objectif)
   *   en float8, visible des deux (null sans pesée ou sans objectif), arrondi au demi-%
   *   pour l'autre sauf showKg (voir « Ce que l'autre voit de mes % » plus haut).
   * - weighIns[] : calculés comme deriveWeighIns (src/core/weight.ts) en float8 :
   *   changePct (null pour la 1re), fromStartPct, goalDistancePct (objectif en vigueur
   *   CE jour-là, null sans objectif). Pour l'autre sauf showKg : weightKg null et % arrondis.
   *   Tri : jour puis joueur.
   * - proposals[].payload : pour goal_weight, goalKg vient d'une table privée et vaut
   *   null si l'auteur est l'autre et ne montre pas ses kilos ; goalFromStartPct est rangé
   *   au demi-%.
   * - seenResults / seenBadges : ceux du joueur lié. badgeUnlocks : des deux joueurs.
   * - habits : toutes (y compris désactivées), checkins : tous, weeks : toutes les
   *   manches connues (gagePaid = { [playerId]: true/false }), settings complet.
   */
  get_snapshot: { args: Record<string, never>; returns: DuelSnapshot }

  // ─── Actions du joueur lié (toutes ajoutent une ligne dans public.events) ───

  /**
   * Remplit / corrige (p_value null = efface) une de SES habitudes. Refus P0001 si le jour
   * n'est pas modifiable (canEditCheckin de core/scoring.ts, avec duel.today()), si
   * l'habitude n'est pas à lui ou pas active ce jour-là (isHabitActiveOn), ou si la valeur
   * ne va pas avec le type (valuesFor de core/scoring.ts, duel.checkin_values côté SQL :
   * avoid : nickel|unpeu|craquage ; avoid_strict : nickel|craquage ; do : fait|pasfait).
   * Un « unpeu » sur une habitude avoid_strict (tout ou rien) a son propre message, le même
   * que checkinValueRefusal : « Pas de « un peu » pour <nom> : c’est Nickel ou Craquage 😉 ».
   * Un « unpeu » enregistré avant qu'une habitude passe en tout ou rien reste en place.
   * Événement 'checkin', ou 'checkin_done' quand le jour devient complet (toutes les
   * habitudes actives remplies) alors qu'il ne l'était pas.
   */
  set_checkin: { args: { p_day: DayKey; p_habit: string; p_value: CheckinValue | null }; returns: null }
  /**
   * Enregistre / corrige SA pesée. p_day doit être duel.today() et, si
   * only_on_weigh_in_day, le jour de pesée en vigueur (weighInDayFor de core/scoring.ts).
   * Poids entre min_kg et max_kg, arrondi à 0,1 kg. Événement 'weighin' (sans kilos).
   */
  save_weigh_in: { args: { p_day: DayKey; p_kg: number }; returns: null }
  /**
   * Profil du joueur lié. Clés acceptées : name (1 à 24 caractères après trim), emoji
   * (1 à 16 caractères), color (#RRGGBB), showKg (booléen). Les autres clés : P0001.
   * Événement 'profile'.
   */
  update_profile: { args: { p_patch: { name?: string; emoji?: string; color?: string; showKg?: boolean } }; returns: null }
  /** Nom (1-24) / emoji / précision (0-40) d'une de SES habitudes, immédiat. Événement 'profile'. */
  update_habit_look: { args: { p_habit: string; p_patch: { name?: string; emoji?: string; hint?: string } }; returns: null }
  /**
   * Nouvelle proposition (garantie 6) : annule (status 'cancelled') la proposition en
   * attente du même auteur sur le même sujet (sameSubject de DemoSource.ts : habit_disable
   * et habit_kind sur une même habitude sont UN sujet), puis insère.
   * Les habitudes visées doivent être à l'auteur et encore actives. habit_add / habit_kind :
   * habitKind = 'avoid' | 'avoid_strict' | 'do' (HabitKind), sinon P0001 « Type d’habitude
   * inconnu 🤔 » ; decide le reprend tel quel. goal_weight : goalKg
   * (si !clear) entre min_kg et max_kg, rangé dans une table privée (jamais dans payload) ;
   * le serveur recalcule goalFromStartPct depuis la 1re pesée (null sans pesée), au demi-%.
   * Acceptée d'office seulement si duel.rules.require_approval est faux (jamais sur demande
   * du téléphone). Renvoie l'id. Événement 'proposal' (ou 'proposal_accepted' si d'office).
   */
  propose: { args: { p_payload: ProposalPayload }; returns: string }
  /**
   * Réponse de l'AUTRE joueur (pas l'auteur) à une proposition en attente. Acceptée :
   * effectiveFrom = lundi suivant (nextMonday de core/dates.ts sur duel.today()) et effets
   * comme DemoSource.decide : habit_add (nouvelle habitude, sortOrder max+1, badgeKey null),
   * habit_disable (activeUntil = lundi), habit_kind (ferme l'ancienne, crée la nouvelle avec
   * le nouveau type ; badgeKey : badgeKeyAfterKindChange de core/badges.ts), weigh_day
   * (règle {from: lundi, isoDay}, remplace une règle au même lundi), goal_weight (objectif
   * {from: lundi, kg} ou null si clear).
   * Accepter habit_disable / habit_kind sur une habitude déjà close : P0001 « Cette habitude
   * est déjà désactivée 🤷 » (on peut toujours la refuser).
   * Événement 'proposal_accepted' / 'proposal_refused'.
   */
  answer_proposal: { args: { p_id: string; p_accept: boolean }; returns: null }
  /** L'auteur annule sa proposition en attente. Événement 'proposal_cancelled' (relecture, pas de toast). */
  cancel_proposal: { args: { p_id: string }; returns: null }
  /**
   * Remplace l'enjeu d'une manche (texte 1 à 120 caractères). Refus P0001 si
   * !isStakeEditable(weekStart, duel.today()) (core/season.ts). Événement 'stake'.
   */
  set_stake: { args: { p_week: DayKey; p_stake: string }; returns: null }
  /**
   * Tirage automatique (garantie 5) : pose l'enjeu SEULEMENT s'il n'y en a pas encore,
   * pour une manche commencée (weekStart lundi, entre la 1re manche et la manche en cours).
   * Les deux téléphones tirent le même gage (drawStake) : le second appel ne change rien.
   * p_stake doit être un gage de settings.gages (sinon P0001) : pas de texte libre ici.
   * Renvoie l'enjeu en place. Pas d'événement si rien n'a changé.
   */
  ensure_stake: { args: { p_week: DayKey; p_stake: string }; returns: string }
  /**
   * Liste des gages (au moins 1, 200 au plus, 120 caractères chacun, vides retirés).
   * Événement 'gages' (relecture, pas de toast).
   */
  set_gages: { args: { p_gages: string[] }; returns: null }
  /** « Gage payé ✅ » : seul l'AUTRE joueur valide (p_player ≠ joueur lié). Événement 'gage_paid'. */
  set_gage_paid: { args: { p_week: DayKey; p_player: PlayerId; p_paid: boolean }; returns: null }
  /** La cérémonie de cette manche a été vue (par le joueur lié). Pas d'événement. */
  mark_results_seen: { args: { p_week: DayKey }; returns: null }
  /**
   * Badges débloqués par le joueur lié ({ badgeId, tier, day } ; playerId ignoré, forcé au
   * joueur lié). Une ligne par (badgeId, tier) : les doublons sont ignorés. Refus P0001
   * « Badge invalide 🤔 » : badgeId hors de BADGES (core/badges.ts), palier pour un autre
   * badge que 'plume' (ou palier ≤ 0, > 100, plus fin que le centième), jour avant le
   * début du duel (ou la 1re pesée) ou après demain, plus de 100 badges par joueur.
   * Événement 'badge' seulement si quelque chose a été ajouté.
   */
  record_badge_unlocks: { args: { p_unlocks: Omit<BadgeUnlock, 'playerId'>[] }; returns: null }
  /** Célébrations vues par le joueur lié (clés libres, ≤ 64 caractères). Pas d'événement. */
  mark_badges_seen: { args: { p_keys: string[] }; returns: null }
}

export type RpcName = keyof DuelRpc

/**
 * Types d'événements de public.events. Ceux qui ont un toast sont les `kind` d'Activity
 * (source.ts) ; les autres font seulement relire le duel : 'proposal_cancelled'
 * (cancel_proposal), 'gages' (set_gages) et 'badge' (record_badge_unlocks).
 * 'profile' = update_profile ou update_habit_look.
 */
export type EventKind =
  | 'checkin'
  | 'checkin_done'
  | 'weighin'
  | 'proposal'
  | 'proposal_accepted'
  | 'proposal_refused'
  | 'proposal_cancelled'
  | 'stake'
  | 'gage_paid'
  | 'profile'
  | 'gages'
  | 'badge'

/**
 * Une ligne de public.events (temps réel : postgres_changes INSERT). Rien de privé :
 * `day` est le jour concerné (check-in, pesée) ou la manche (enjeu, gage), sinon null.
 */
export interface EventRow {
  id: number
  player_id: PlayerId
  kind: EventKind
  day: DayKey | null
  created_at: string
}
