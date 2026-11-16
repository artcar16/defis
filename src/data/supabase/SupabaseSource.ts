/**
 * Source de données réelle : Supabase (étapes 4-5).
 *
 * - Connexion (décision 20) : session Supabase ANONYME (signInAnonymously), liée à un joueur
 *   par claim_player(prénom, code). Le téléphone garde sa session (localStorage, clé 'duel-auth').
 * - Lecture : get_snapshot (déjà filtré par le serveur : kilos de l'autre masqués).
 * - Écriture : uniquement des fonctions RPC (contrat : ./api.ts).
 * - Temps réel : INSERT sur public.events → on relit le snapshot (regroupé, ~250 ms) et on
 *   signale (toast) ce qu'a fait l'AUTRE joueur. On relit aussi au retour au premier plan,
 *   au retour du réseau, et au moins une fois par minute quand l'app est à l'écran (si le
 *   temps réel ne livre rien). Une relecture ratée est refaite toute seule (délai croissant).
 * - Démarrage : un téléphone déjà connecté qui ne joint pas le serveur reste sur l'écran
 *   d'attente (avec le problème et « Réessayer »), jamais sur « Qui es-tu ? ».
 *
 * Tient les 7 garanties de DuelSource (voir l'en-tête de ../source.ts).
 *
 * Cycle de vie (React StrictMode) : le constructeur ne lance rien. subscribe() démarre tout
 * (session, chargement, temps réel, écouteurs) si besoin ; dispose() coupe tout, et un
 * nouveau subscribe() relance proprement sur la même instance.
 */
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_GAGES, DEFAULT_PLAYERS, SEASON_START } from '../../config/defaults'
import { RULES } from '../../config/rules'
import { badgeUnlocksToRecord, computeBadges } from '../../core/badges'
import { addDays, dayKeyAt, weekStartOf } from '../../core/dates'
import { checkinValueRefusal } from '../../core/scoring'
import { buildSeason } from '../../core/season'
import { drawStake } from '../../core/stake'
import type { BadgeUnlock, CheckinValue, DayKey, DuelSnapshot, PlayerId, ProposalPayload } from '../../core/types'
import { makeActivity, type ActivityKind } from '../activity'
import type { Activity, DuelSource, HabitLookPatch, LoginPlayer, ProfilePatch } from '../source'
import type { DuelRpc, EventRow, RpcName } from './api'
import { classifyError, isCodeFormatOk, MESSAGES, toErrorLike, toUserMessage, type ErrorKind, type ErrorLike } from './errors'
import { roundKg, withBadgesSeen, withCheckin, withGagePaid, withHabitLook, withProfile, withResultsSeen, withWeighIn } from './patches'

// ─── Le client Supabase, réduit à ce dont la source a besoin ─────────────────

/** Une session Supabase (la source ne regarde que sa présence). */
export type SessionLike = object

/** Réponse d'un appel RPC (PostgREST) : `error` non nul en cas d'échec, `status` HTTP (0 : réseau). */
export interface RpcResult {
  data: unknown
  error: ErrorLike | null
  status?: number
}

/** Statuts d'un canal temps réel (REALTIME_SUBSCRIBE_STATES de supabase-js). */
export type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'

/** Filtre « INSERT sur public.events » (seul abonnement de la source). */
export interface EventsFilter {
  event: 'INSERT'
  schema: 'public'
  table: 'events'
}

/** Un canal temps réel (RealtimeChannel de supabase-js). */
export interface ChannelLike {
  on(type: 'postgres_changes', filter: EventsFilter, callback: (payload: { new: EventRow }) => void): ChannelLike
  subscribe(callback?: (status: ChannelStatus, err?: Error) => void): ChannelLike
}

/**
 * Le strict minimum du client Supabase (SupabaseClient de supabase-js le satisfait).
 * Un faux client (tests, base PGlite) n'a qu'à fournir ceci :
 * - auth.getSession() : la session gardée sur le téléphone (null si aucune) ;
 * - auth.signInAnonymously() : crée une session anonyme (erreur Auth si désactivée) ;
 * - auth.signOut() : oublie la session ;
 * - auth.onAuthStateChange(cb) : prévient (au moins) de 'SIGNED_OUT' ;
 * - rpc(nom, args) : appelle une fonction de api.ts, renvoie { data, error } (ne lève pas :
 *   une coupure réseau est une `error` avec code '' et message « TypeError: … ») ;
 * - channel(nom) / removeChannel(canal) : temps réel, INSERT sur public.events
 *   (payload.new = une ligne EventRow) ; subscribe(cb) appelle cb('SUBSCRIBED') une fois branché.
 */
export interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: SessionLike | null }; error: ErrorLike | null }>
    signInAnonymously(): Promise<{ data: { session: SessionLike | null }; error: ErrorLike | null }>
    signOut(options?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: ErrorLike | null }>
    onAuthStateChange(callback: (event: string, session: SessionLike | null) => void): {
      data: { subscription: { unsubscribe(): void } }
    }
  }
  rpc(fn: RpcName, args?: object): PromiseLike<RpcResult>
  channel(name: string): ChannelLike
  removeChannel(channel: ChannelLike): Promise<unknown>
}

// ─── Réglages ─────────────────────────────────────────────────────────────────

/** Regroupe les événements rapprochés en une seule relecture. */
export const RELOAD_DEBOUNCE_MS = 250
/** Démarrage ou relecture ratés (réseau, serveur en pause) : nouvel essai automatique… */
export const RETRY_MS = 10_000
/** … avec un délai qui double à chaque échec, jusqu'à ce plafond. */
export const RETRY_MAX_MS = 60_000
/** Relecture de secours, app à l'écran, si rien n'a été relu entre-temps (temps réel muet). */
export const POLL_MS = 60_000
/** Délai maximal d'une requête : au-delà, c'est une coupure (sinon ~60 s sur iPhone). */
export const FETCH_TIMEOUT_MS = 15_000
/** Clé de la session dans le localStorage du téléphone. */
export const AUTH_STORAGE_KEY = 'duel-auth'

type Listener = (snapshot: DuelSnapshot, activity?: Activity) => void
type Timer = ReturnType<typeof setTimeout>

/** Un effet optimiste en cours (garantie 1). */
interface PendingOp {
  apply: (s: DuelSnapshot) => DuelSnapshot
  /**
   * null tant que le serveur n'a pas répondu. Ensuite : numéro de la dernière lecture lancée
   * au moment de la réponse ; toute lecture lancée APRÈS contient l'effet, qu'on peut oublier.
   */
  doneAt: number | null
}

/** Un événement de public.events reçu, en attente de la relecture qui le montrera. */
interface PendingEvent {
  row: EventRow
  /** Numéro de la dernière lecture lancée à la réception (les lectures suivantes le voient). */
  afterSeq: number
}

/**
 * Événements qui méritent un toast. Les autres font seulement relire le duel : check-in à
 * moitié rempli, badge, proposition annulée ('proposal_cancelled'), liste des gages ('gages').
 */
const TOAST_KINDS = new Set<string>([
  'checkin_done',
  'weighin',
  'proposal',
  'proposal_accepted',
  'proposal_refused',
  'stake',
  'gage_paid',
  'profile',
] satisfies ActivityKind[])

/**
 * Événement 'stake' venu du tirage automatique du lundi (ensure_stake sur le téléphone de
 * l'autre) : l'enjeu en place est celui de drawStake, personne ne l'a « changé » → pas de toast.
 */
function isAutoDrawnStake(s: DuelSnapshot, row: EventRow): boolean {
  if (row.kind !== 'stake' || !row.day) return false
  const stake = s.weeks.find((w) => w.weekStart === row.day)?.stake ?? null
  const previous = s.weeks.find((w) => w.weekStart === addDays(row.day as DayKey, -7))?.stake ?? null
  return stake !== null && stake === drawStake(s.settings.gages, row.day, previous)
}

/** Échec d'un appel RPC (garde l'erreur d'origine pour la classer). */
class RpcFailure extends Error {
  readonly detail: ErrorLike
  constructor(detail: ErrorLike) {
    super(detail.message ?? '')
    this.detail = detail
  }
}

/** Snapshot de départ (garantie 7) : joueurs et réglages par défaut, aucune donnée. */
export function initialSnapshot(): DuelSnapshot {
  const players = DEFAULT_PLAYERS.map((p) => ({
    id: p.key,
    name: p.name,
    emoji: p.emoji,
    color: p.color,
    showKg: false,
    goalKg: null,
    goalFromStartPct: null,
  }))
  return {
    meId: players[0].id,
    players,
    habits: [],
    checkins: [],
    weighIns: [],
    weeks: [],
    settings: {
      seasonStart: SEASON_START,
      weighInDays: [{ from: SEASON_START, isoDay: RULES.weighIn.defaultDay }],
      gages: [...DEFAULT_GAGES],
    },
    proposals: [],
    seenResults: [],
    badgeUnlocks: [],
    seenBadges: [],
  }
}

function list<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : []
}

/**
 * Vérifie et complète ce que renvoie get_snapshot (tableaux vides plutôt que null).
 * null si la forme ne va pas (garantie 2 : exactement 2 joueurs, `meId` parmi eux).
 */
export function normalizeSnapshot(raw: unknown): DuelSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<DuelSnapshot>
  const players = list(s.players)
  if (players.length !== 2 || typeof s.meId !== 'string' || !players.some((p) => p?.id === s.meId)) return null
  const settings: Partial<DuelSnapshot['settings']> = s.settings ?? {}
  return {
    meId: s.meId,
    players: players.map((p) => ({ ...p, showKg: !!p.showKg, goalKg: p.goalKg ?? null, goalFromStartPct: p.goalFromStartPct ?? null })),
    habits: list(s.habits),
    checkins: list(s.checkins),
    weighIns: list(s.weighIns),
    weeks: list(s.weeks).map((w) => ({ ...w, stake: w.stake ?? null, gagePaid: w.gagePaid ?? {} })),
    settings: {
      seasonStart: settings.seasonStart ?? SEASON_START,
      weighInDays: list(settings.weighInDays),
      gages: list(settings.gages),
    },
    proposals: list(s.proposals),
    seenResults: list(s.seenResults),
    badgeUnlocks: list(s.badgeUnlocks),
    seenBadges: list(s.seenBadges),
  }
}

export interface SupabaseSourceOptions {
  client: SupabaseLike
  /** Horloge (les tests en passent une fixe). Défaut : l'heure réelle. */
  clock?: () => Date
}

export class SupabaseSource implements DuelSource {
  readonly mode = 'supabase' as const
  private readonly client: SupabaseLike
  private readonly clock: () => Date
  private listeners = new Set<Listener>()

  /** Dernier snapshot du serveur (ou de départ). */
  private server: DuelSnapshot = initialSnapshot()
  /** Ce que voient les écrans : le serveur + les effets optimistes en cours. */
  private snapshot: DuelSnapshot = this.server
  private ops: PendingOp[] = []
  private _loading = true
  private _problem: string | null = null
  private _signedIn = false

  /** Démarrée (subscribe) et pas encore coupée (dispose). */
  private running = false
  /** Génération du démarrage : une réponse d'avant un dispose() est ignorée. */
  private run = 0
  /** Génération dont le démarrage (boot) est en cours, 0 si aucun. */
  private bootingRun = 0
  /** Quand ce démarrage a commencé (Date.now()) : au-delà de FETCH_TIMEOUT_MS, il est bloqué. */
  private bootStartedAt = 0
  /** Numéro de la dernière lecture lancée / appliquée (une réponse plus ancienne est ignorée). */
  private loadSeq = 0
  private appliedSeq = 0
  private reloadTimer: Timer | null = null
  private retryTimer: Timer | null = null
  /** Délai du prochain nouvel essai (double à chaque échec, revient à RETRY_MS au succès). */
  private retryDelay = RETRY_MS
  /**
   * Le démarrage est à refaire (raté, ou session gardée pas encore chargée). Lu par refresh() :
   * un problème effacé entre-temps (ex. login_players qui répond) ne doit pas l'annuler.
   */
  private bootPending = false
  private pollTimer: ReturnType<typeof setInterval> | null = null
  /** Dernière lecture appliquée (Date.now()), pour la relecture de secours. */
  private lastLoadAt = 0
  private channel: ChannelLike | null = null
  private channelCount = 0
  private authSubscription: { unsubscribe(): void } | null = null
  private removeDomListeners: (() => void) | null = null
  private events: PendingEvent[] = []
  /**
   * Manches dont l'enjeu a été posé par ensure_stake (pas deux fois), avec le numéro de la
   * dernière lecture lancée à ce moment-là : une lecture lancée APRÈS doit le contenir.
   */
  private stakesDone = new Map<DayKey, number>()
  private ensuringStakes = false
  /** Badges en cours d'enregistrement (le Provider redemande à chaque snapshot). */
  private badgesInFlight = new Set<string>()

  constructor(opts: SupabaseSourceOptions) {
    this.client = opts.client
    this.clock = opts.clock ?? (() => new Date())
  }

  // ─── Lecture ─────────────────────────────────────────────────────────────

  get loading(): boolean {
    return this._loading
  }

  get problem(): string | null {
    return this._problem
  }

  get signedIn(): boolean {
    return this._signedIn
  }

  getSnapshot(): DuelSnapshot {
    return this.snapshot
  }

  now(): Date {
    return this.clock()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    if (!this.running) this.start()
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Coupe temps réel, minuteurs et écouteurs. Un nouveau subscribe() relance tout. */
  dispose(): void {
    this.running = false
    this.run++
    this.stopChannel()
    this.clearReloadTimer()
    this.clearRetryTimer()
    this.stopPoll()
    this.authSubscription?.unsubscribe()
    this.authSubscription = null
    this.removeDomListeners?.()
    this.removeDomListeners = null
    this.listeners.clear()
  }

  // ─── Connexion ───────────────────────────────────────────────────────────

  async loginPlayers(): Promise<LoginPlayer[]> {
    let rows: DuelRpc['login_players']['returns']
    try {
      rows = await this.call('login_players', {})
    } catch (e) {
      throw this.userError(e)
    }
    // Le serveur répond : un problème d'avant (réseau, base pas prête) est peut-être réglé.
    // Démarrage à refaire : on le refait plutôt que d'effacer le problème (une session gardée
    // doit être relue, sinon plus rien ne réessaierait). Sinon (refus d'une action), on l'efface.
    if (this._problem !== null && !this._signedIn) {
      if (this.bootPending || this._loading) {
        this.refresh()
      } else {
        this._problem = null
        this.emit()
      }
    }
    return list(rows).map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, hasCode: !!p.hasCode }))
  }

  async signIn(playerId: PlayerId, code: string): Promise<void> {
    if (!isCodeFormatOk(code)) throw new Error(MESSAGES.codeFormat)
    try {
      const { data, error } = await this.client.auth.getSession()
      if (error && classifyError(error) === 'network') throw error
      if (!data?.session) {
        const res = await this.client.auth.signInAnonymously()
        if (res.error) throw res.error
      }
      await this.call('claim_player', { p_player: playerId, p_code: code })
    } catch (e) {
      throw this.userError(e)
    }
    // Le code est pris et ce téléphone est lié : c'est réussi, même si la relecture rate.
    this.bootPending = true
    this.clearRetryTimer()
    await this.reload()
    // Relecture ratée (réseau) : écran d'attente et nouvel essai tout seuls (failLoad), on
    // ne dit pas « échec » pour un code bien enregistré. Seul un vrai blocage rejette.
    if (!this._signedIn && !this._loading) throw new Error(this._problem ?? MESSAGES.network)
  }

  async changeCode(oldCode: string, newCode: string): Promise<void> {
    if (!isCodeFormatOk(oldCode) || !isCodeFormatOk(newCode)) throw new Error(MESSAGES.codeFormat)
    try {
      await this.call('change_code', { p_old: oldCode, p_new: newCode })
    } catch (e) {
      throw this.userError(e)
    }
  }

  async unlockCode(): Promise<number> {
    this.requireSignedIn()
    try {
      const n = await this.call('clear_code_failures', {})
      return typeof n === 'number' ? n : 0
    } catch (e) {
      throw this.userError(e)
    }
  }

  /** « Réessayer » (écran d'attente) : sans attendre le prochain essai automatique. */
  retry(): void {
    if (!this.running) return
    this.clearRetryTimer()
    this.retryDelay = RETRY_MS
    if (this._signedIn) {
      this.clearReloadTimer()
      void this.reload()
      return
    }
    // Démarrage raté ou bloqué : on repart de zéro (l'ancien, s'il répond un jour, est ignoré).
    const run = ++this.run
    void this.boot(run)
  }

  /** « Se déconnecter » : délie ce téléphone (erreurs ignorées), oublie la session. */
  async signOut(): Promise<void> {
    this.stopChannel()
    this.clearReloadTimer()
    try {
      await this.client.rpc('release_device', {})
    } catch {
      // Hors ligne : tant pis, la session est oubliée quand même.
    }
    try {
      await this.client.auth.signOut({ scope: 'local' })
    } catch {
      // Idem.
    }
    this.toSignedOut()
  }

  // ─── Actions optimistes (garantie 1) ─────────────────────────────────────

  async setCheckin(day: DayKey, habitId: string, value: CheckinValue | null): Promise<void> {
    this.requireSignedIn()
    const habit = this.snapshot.habits.find((h) => h.id === habitId && h.playerId === this.snapshot.meId)
    if (!habit) throw new Error(MESSAGES.unknownHabit)
    // Une réponse de son type : le serveur refuserait (même message), autant ne rien afficher
    // d'optimiste (« Un peu » sur une habitude tout ou rien, précision 22).
    const refusal = checkinValueRefusal(habit, value)
    if (refusal) throw new Error(refusal)
    const at = this.clock().toISOString()
    await this.optimistic(
      (s) => withCheckin(s, day, habitId, value, at),
      () => this.call('set_checkin', { p_day: day, p_habit: habitId, p_value: value }),
    )
  }

  async saveWeighIn(day: DayKey, weightKg: number): Promise<void> {
    const kg = roundKg(weightKg)
    await this.optimistic(
      (s) => withWeighIn(s, day, kg),
      () => this.call('save_weigh_in', { p_day: day, p_kg: kg }),
    )
  }

  async updateProfile(patch: ProfilePatch): Promise<void> {
    const clean: ProfilePatch = {}
    if (patch.name !== undefined) clean.name = patch.name.trim()
    if (patch.emoji !== undefined) clean.emoji = patch.emoji
    if (patch.color !== undefined) clean.color = patch.color
    if (patch.showKg !== undefined) clean.showKg = patch.showKg
    if (Object.keys(clean).length === 0) return
    await this.optimistic(
      (s) => withProfile(s, clean),
      () => this.call('update_profile', { p_patch: clean }),
    )
  }

  async updateHabitLook(habitId: string, patch: HabitLookPatch): Promise<void> {
    const clean: HabitLookPatch = {}
    if (patch.name !== undefined) clean.name = patch.name.trim()
    if (patch.emoji !== undefined) clean.emoji = patch.emoji
    if (patch.hint !== undefined) clean.hint = patch.hint.trim()
    if (Object.keys(clean).length === 0) return
    await this.optimistic(
      (s) => withHabitLook(s, habitId, clean),
      () => this.call('update_habit_look', { p_habit: habitId, p_patch: clean }),
    )
  }

  async setGagePaid(weekStart: DayKey, playerId: PlayerId, paid: boolean): Promise<void> {
    this.requireSignedIn()
    // C'est l'autre (le gagnant) qui valide le gage : le serveur refuserait aussi.
    if (playerId === this.snapshot.meId) throw new Error(MESSAGES.notYourGage)
    await this.optimistic(
      (s) => withGagePaid(s, weekStart, playerId, paid),
      () => this.call('set_gage_paid', { p_week: weekStart, p_player: playerId, p_paid: paid }),
    )
  }

  async markResultsSeen(weekStart: DayKey): Promise<void> {
    this.requireSignedIn()
    if (this.snapshot.seenResults.includes(weekStart)) return
    await this.optimistic(
      (s) => withResultsSeen(s, weekStart),
      () => this.call('mark_results_seen', { p_week: weekStart }),
    )
  }

  async markBadgesSeen(keys: string[]): Promise<void> {
    this.requireSignedIn()
    const fresh = [...new Set(keys)].filter((k) => !this.snapshot.seenBadges.includes(k))
    if (fresh.length === 0) return
    await this.optimistic(
      (s) => withBadgesSeen(s, fresh),
      () => this.call('mark_badges_seen', { p_keys: fresh }),
    )
  }

  // ─── Autres actions : RPC, relecture, notify, puis résolution ────────────

  /** L'acceptation d'office (RULES.proposals.requireApproval faux) est décidée par le serveur. */
  async propose(payload: ProposalPayload): Promise<void> {
    await this.act('propose', { p_payload: payload })
  }

  async answerProposal(proposalId: string, accept: boolean): Promise<void> {
    await this.act('answer_proposal', { p_id: proposalId, p_accept: accept })
  }

  async cancelProposal(proposalId: string): Promise<void> {
    await this.act('cancel_proposal', { p_id: proposalId })
  }

  async setStake(weekStart: DayKey, stake: string): Promise<void> {
    await this.act('set_stake', { p_week: weekStart, p_stake: stake.trim() })
  }

  async setGages(gages: string[]): Promise<void> {
    await this.act('set_gages', { p_gages: gages.map((g) => g.trim()).filter(Boolean) })
  }

  /**
   * Badges gravés pour de bon (décision 16) : seulement ce que le serveur a CONFIRMÉ. Tant
   * qu'une action optimiste attend sa réponse (un check-in peut être refusé), on n'enregistre
   * rien : le Provider redemande au snapshot suivant. Et on recalcule les badges sur le
   * snapshot actuel : la demande peut dater d'un effet déjà annulé.
   */
  async recordBadgeUnlocks(unlocks: BadgeUnlock[]): Promise<void> {
    if (!this._signedIn || this.ops.some((op) => op.doneAt === null)) return
    const snap = this.snapshot
    const me = snap.meId
    const keyOf = (u: Pick<BadgeUnlock, 'badgeId' | 'tier'>) => `${u.badgeId}|${u.tier ?? ''}`
    const known = new Set(snap.badgeUnlocks.filter((u) => u.playerId === me).map(keyOf))
    const today = dayKeyAt(this.now())
    const confirmed = new Set(badgeUnlocksToRecord(me, computeBadges(me, snap, buildSeason(snap, today), today), []).map(keyOf))
    const todo = new Map<string, BadgeUnlock>()
    for (const u of unlocks) {
      // Seulement mes badges (le serveur les range de toute façon au joueur lié), une fois chacun.
      const key = keyOf(u)
      if (u.playerId !== me || !confirmed.has(key) || known.has(key) || this.badgesInFlight.has(key) || todo.has(key)) continue
      todo.set(key, u)
    }
    if (todo.size === 0) return
    for (const key of todo.keys()) this.badgesInFlight.add(key)
    try {
      await this.act('record_badge_unlocks', {
        p_unlocks: [...todo.values()].map((u) => ({ badgeId: u.badgeId, tier: u.tier ?? null, day: u.day })),
      })
    } finally {
      for (const key of todo.keys()) this.badgesInFlight.delete(key)
    }
  }

  // ─── Démarrage ───────────────────────────────────────────────────────────

  private start() {
    this.running = true
    const run = ++this.run
    this.listenAuth()
    this.listenDom()
    this.startPoll()
    // Remonté après un dispose() en étant connecté : on relit (et on rebranche le temps réel).
    if (this._signedIn) void this.reload()
    else void this.boot(run)
  }

  /** Session gardée ? → chargement. Sinon : déconnecté (après avoir vérifié que la base répond). */
  private async boot(run: number): Promise<void> {
    this.bootingRun = run
    this.bootStartedAt = Date.now()
    // Garde-fou : une requête pendue (client sans délai maximal) ne laisse pas l'écran
    // d'attente muet pour toujours. On le dit, et on repart de zéro.
    const watchdog = setTimeout(() => {
      if (!this.running || run !== this.run || this.bootingRun !== run) return
      this._problem = MESSAGES.offline
      this.emit()
      this.refresh()
    }, FETCH_TIMEOUT_MS + 1000)
    try {
      await this.bootSteps(run)
    } finally {
      clearTimeout(watchdog)
      if (this.bootingRun === run) this.bootingRun = 0
    }
  }

  private async bootSteps(run: number): Promise<void> {
    this.clearRetryTimer()
    let session: SessionLike | null = null
    try {
      const { data, error } = await this.client.auth.getSession()
      if (error && classifyError(error) === 'network') throw error
      session = data?.session ?? null
    } catch (e) {
      if (run === this.run) this.failBoot(e)
      return
    }
    // Démarrage périmé (dispose), ou connexion faite entre-temps (signIn) : rien à faire.
    if (run !== this.run || this._signedIn) return
    if (session) {
      // Téléphone déjà connecté : à refaire tant que la lecture n'est pas passée (failLoad
      // garde alors l'écran d'attente, sans jamais redemander le code).
      this.bootPending = true
      await this.reload()
      return
    }
    // Pas de session : l'écran de connexion. On vérifie au passage que la base est prête.
    try {
      await this.call('login_players', {})
    } catch (e) {
      if (run === this.run) this.failBoot(e)
      return
    }
    if (run !== this.run || this._signedIn) return
    this.toSignedOut()
  }

  /** Démarrage raté sans session gardée : problème (base pas prête, réseau…) et nouvel essai. */
  private failBoot(e: unknown) {
    if (this._signedIn) return
    const kind = classifyError(e instanceof RpcFailure ? e.detail : e)
    if (kind === 'notMember') return this.toSignedOut()
    this.bootPending = true
    this._loading = false
    this._problem = problemFor(kind)
    if (kind !== 'badKey') this.scheduleRetry()
    this.emit()
  }

  /** Nouvel essai dans retryDelay, qui double à chaque fois (jusqu'à RETRY_MAX_MS). */
  private scheduleRetry() {
    if (!this.running || this.retryTimer !== null) return
    const delay = this.retryDelay
    this.retryDelay = Math.min(RETRY_MAX_MS, this.retryDelay * 2)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.refresh()
    }, delay)
  }

  private clearRetryTimer() {
    if (this.retryTimer === null) return
    clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  /**
   * Retour au premier plan, retour du réseau, nouvel essai : on relit (ou on redémarre).
   * Un démarrage en cours n'est pas doublé, sauf s'il traîne depuis plus de FETCH_TIMEOUT_MS
   * (requête pendue) : on repart de zéro, comme « Réessayer » (retry).
   */
  private refresh() {
    if (!this.running) return
    if (this._signedIn) return this.scheduleReload()
    if (this.bootingRun === this.run) {
      if (Date.now() - this.bootStartedAt < FETCH_TIMEOUT_MS) return
      void this.boot(++this.run)
      return
    }
    if (this.bootPending || this._loading) void this.boot(this.run)
  }

  /**
   * Relecture de secours, toutes les POLL_MS quand l'app est à l'écran, sauf si le duel a
   * été relu récemment (le temps réel marche) : rattrape un temps réel muet.
   */
  private startPoll() {
    if (this.pollTimer !== null) return
    this.pollTimer = setInterval(() => {
      const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
      if (this._signedIn && visible && Date.now() - this.lastLoadAt >= POLL_MS / 2) this.scheduleReload()
    }, POLL_MS)
  }

  private stopPoll() {
    if (this.pollTimer === null) return
    clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  private listenAuth() {
    if (this.authSubscription) return
    const { data } = this.client.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      // Session perdue (jeton révoqué, déconnexion dans un autre onglet). Pas d'appel à
      // Supabase dans ce rappel (verrou interne d'Auth) : on diffère.
      setTimeout(() => {
        if (this.running && this._signedIn) this.toSignedOut()
      }, 0)
    })
    this.authSubscription = data.subscription
  }

  private listenDom() {
    if (this.removeDomListeners) return
    const doc = typeof document === 'undefined' ? null : document
    const win = typeof window === 'undefined' ? null : window
    const onVisible = () => {
      if (doc?.visibilityState === 'visible') this.refresh()
    }
    const onOnline = () => this.refresh()
    doc?.addEventListener('visibilitychange', onVisible)
    win?.addEventListener('online', onOnline)
    this.removeDomListeners = () => {
      doc?.removeEventListener('visibilitychange', onVisible)
      win?.removeEventListener('online', onOnline)
    }
  }

  // ─── Chargement ──────────────────────────────────────────────────────────

  /**
   * Relit tout le duel. Vrai si ce snapshot a été appliqué. Une réponse plus ancienne
   * qu'une lecture déjà appliquée est ignorée.
   */
  private async reload(): Promise<boolean> {
    const seq = ++this.loadSeq
    let raw: unknown
    try {
      raw = await this.call('get_snapshot', {})
    } catch (e) {
      if (seq > this.appliedSeq) this.failLoad(e)
      return false
    }
    if (seq <= this.appliedSeq) return false
    const snap = normalizeSnapshot(raw)
    if (!snap) {
      this._loading = false
      this._problem = MESSAGES.dbOutdated
      this.emit()
      return false
    }
    this.appliedSeq = seq
    this.server = snap
    // Les effets confirmés avant le lancement de cette lecture y sont déjà.
    this.ops = this.ops.filter((op) => op.doneAt === null || op.doneAt >= seq)
    this.snapshot = this.compose()
    this._signedIn = true
    this._loading = false
    this._problem = null
    this.bootPending = false
    this.lastLoadAt = Date.now()
    this.retryDelay = RETRY_MS
    this.clearRetryTimer()
    this.forgetErasedStakes(seq, snap)
    this.startChannel()
    this.emit(this.takeActivity(seq))
    void this.ensureStakes()
    return true
  }

  /**
   * Lecture ratée. Connecté : on garde les données, on prévient (bandeau) et on relit tout
   * seuls (délai croissant). Pas encore connecté (session gardée, ou code tout juste pris) :
   * écran d'attente avec le problème, jamais « Qui es-tu ? », et nouvel essai.
   */
  private failLoad(e: unknown) {
    const kind = classifyError(e instanceof RpcFailure ? e.detail : e)
    if (kind === 'notMember') return this.toSignedOut()
    if (this._signedIn) {
      this._problem = kind === 'network' ? MESSAGES.stale : problemFor(kind)
    } else {
      this.bootPending = true
      this._loading = true
      this._problem = problemFor(kind)
    }
    if (kind !== 'badKey') this.scheduleRetry()
    this.emit()
  }

  private compose(): DuelSnapshot {
    return this.ops.reduce((s, op) => op.apply(s), this.server)
  }

  /** Déconnecté : plus de données en mémoire, plus de temps réel. Notifie. */
  private toSignedOut() {
    this.stopChannel()
    this.clearReloadTimer()
    this.clearRetryTimer()
    this._signedIn = false
    this._loading = false
    this._problem = null
    this.bootPending = false
    this.retryDelay = RETRY_MS
    this.ops = []
    this.events = []
    this.stakesDone.clear()
    this.appliedSeq = this.loadSeq
    this.server = initialSnapshot()
    this.snapshot = this.server
    this.emit()
  }

  private emit(activity?: Activity) {
    for (const l of [...this.listeners]) l(this.snapshot, activity)
  }

  // ─── Temps réel ──────────────────────────────────────────────────────────

  private startChannel() {
    if (!this.running || this.channel) return
    // Un nom neuf à chaque fois : supabase-js réutilise un canal de même nom, même en cours de fermeture.
    const ch = this.client.channel(`duel-events-${++this.channelCount}-${Math.random().toString(36).slice(2, 8)}`)
    this.channel = ch
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, (payload) => {
      if (this.channel === ch) this.onEvent(payload?.new)
    })
    ch.subscribe((status) => {
      // Branché (ou rebranché après une coupure) : on a pu rater des événements → relecture.
      if (this.channel === ch && status === 'SUBSCRIBED') this.scheduleReload()
    })
  }

  private stopChannel() {
    const ch = this.channel
    if (!ch) return
    this.channel = null
    this.client.removeChannel(ch).catch(() => {})
  }

  private onEvent(row: EventRow | undefined) {
    if (!row || typeof row.kind !== 'string') return
    this.events.push({ row, afterSeq: this.loadSeq })
    if (this.events.length > 50) this.events.splice(0, this.events.length - 50)
    this.scheduleReload()
  }

  /** Une relecture dans RELOAD_DEBOUNCE_MS (les demandes rapprochées n'en font qu'une). */
  private scheduleReload() {
    if (!this.running || this.reloadTimer !== null) return
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null
      void this.reload()
    }, RELOAD_DEBOUNCE_MS)
  }

  private clearReloadTimer() {
    if (this.reloadTimer === null) return
    clearTimeout(this.reloadTimer)
    this.reloadTimer = null
  }

  /**
   * Le toast à montrer avec la lecture `seq` : le dernier événement de l'AUTRE joueur
   * (garantie 4) reçu avant son lancement, avec son prénom à jour.
   */
  private takeActivity(seq: number): Activity | undefined {
    const seen = this.events.filter((e) => e.afterSeq < seq)
    if (seen.length === 0) return undefined
    this.events = this.events.filter((e) => e.afterSeq >= seq)
    const s = this.snapshot
    const row = seen
      .map((e) => e.row)
      .filter((r) => r.player_id !== s.meId && TOAST_KINDS.has(r.kind) && !isAutoDrawnStake(s, r))
      .at(-1)
    if (!row) return undefined
    const other = s.players.find((p) => p.id === row.player_id)
    if (!other) return undefined
    const kind = row.kind as ActivityKind
    const paid = kind === 'gage_paid' ? s.weeks.find((w) => w.weekStart === row.day)?.gagePaid[s.meId] : undefined
    return makeActivity(kind, other.id, other.name, { paid })
  }

  // ─── Enjeu automatique (garantie 5) ──────────────────────────────────────

  /**
   * Un enjeu posé, puis absent d'une lecture lancée après : il a été effacé (remise à zéro
   * dans le SQL Editor, app restée ouverte). On l'oublie, pour le tirer à nouveau. Une lecture
   * lancée avant la pose ne compte pas (elle ne pouvait pas encore le voir).
   */
  private forgetErasedStakes(seq: number, snap: DuelSnapshot) {
    for (const [ws, doneAt] of this.stakesDone) {
      if (seq > doneAt && !snap.weeks.find((w) => w.weekStart === ws)?.stake?.trim()) this.stakesDone.delete(ws)
    }
  }

  /** Chaque manche commencée sans enjeu en reçoit un, tiré avec drawStake (le même sur les deux téléphones). */
  private async ensureStakes(): Promise<void> {
    if (!RULES.stake.autoDrawOnMonday || this.ensuringStakes || !this._signedIn) return
    const snap = this.server
    const last = weekStartOf(dayKeyAt(this.now()))
    const known = new Map(snap.weeks.map((w) => [w.weekStart, w.stake]))
    this.ensuringStakes = true
    let changed = false
    try {
      for (let ws = weekStartOf(snap.settings.seasonStart); ws <= last; ws = addDays(ws, 7)) {
        if (known.get(ws)?.trim() || this.stakesDone.has(ws)) continue
        const stake = drawStake(snap.settings.gages, ws, known.get(addDays(ws, -7)) ?? null)
        if (!stake) continue
        try {
          const placed = await this.call('ensure_stake', { p_week: ws, p_stake: stake })
          this.stakesDone.set(ws, this.loadSeq)
          known.set(ws, typeof placed === 'string' && placed.trim() ? placed : stake)
          changed = true
        } catch {
          break // On réessaiera au prochain chargement.
        }
      }
    } finally {
      this.ensuringStakes = false
    }
    if (changed && this._signedIn) await this.reload()
  }

  // ─── Outils ──────────────────────────────────────────────────────────────

  /** Appel RPC typé par le contrat (api.ts). Lève RpcFailure en cas d'erreur. */
  private async call<N extends RpcName>(fn: N, args: DuelRpc[N]['args']): Promise<DuelRpc[N]['returns']> {
    let res: RpcResult
    try {
      res = await this.client.rpc(fn, args)
    } catch (e) {
      throw new RpcFailure(toErrorLike(e))
    }
    if (res.error) {
      // Le statut HTTP est sur la réponse, pas sur l'erreur : 0 = réseau, 401 sans code = clé.
      const err = toErrorLike(res.error)
      if (err.status === undefined && typeof res.status === 'number') err.status = res.status
      throw new RpcFailure(err)
    }
    return res.data as DuelRpc[N]['returns']
  }

  /** Erreur → message en français. Au passage : 28000 → déconnecté, PGRST202 → problème. */
  private userError(e: unknown): Error {
    const err = e instanceof RpcFailure ? e.detail : toErrorLike(e)
    const kind = classifyError(err)
    if (kind === 'notMember' && this._signedIn) this.toSignedOut()
    // Problème de configuration (script SQL pas lancé, clé refusée) : dit aussi en bandeau.
    if ((kind === 'noFunction' || kind === 'badKey') && this._problem !== problemFor(kind)) {
      this._loading = false
      this._problem = problemFor(kind)
      this.emit()
    }
    return new Error(toUserMessage(err))
  }

  private requireSignedIn() {
    if (!this._signedIn) throw new Error(MESSAGES.notMember)
  }

  /**
   * Garantie 1 : effet local + notify AVANT l'appel. Échec → on retire l'effet, on relit
   * (annulation), on notifie, puis on rejette avec un message en français.
   */
  private async optimistic(apply: (s: DuelSnapshot) => DuelSnapshot, send: () => Promise<unknown>): Promise<void> {
    this.requireSignedIn()
    const op: PendingOp = { apply, doneAt: null }
    this.ops.push(op)
    this.snapshot = this.compose()
    this.emit()
    try {
      await send()
    } catch (e) {
      this.ops = this.ops.filter((o) => o !== op)
      const error = this.userError(e)
      if (this._signedIn && !(await this.reload())) {
        this.snapshot = this.compose()
        this.emit()
      }
      throw error
    }
    op.doneAt = this.loadSeq
    // L'écho temps réel relira aussi : les deux demandes n'en font qu'une. (Déconnecté
    // entre-temps : rien à relire, surtout pas une lecture anonyme qui rouvrirait l'attente.)
    if (this._signedIn) this.scheduleReload()
  }

  /** Action non optimiste : RPC, relecture (qui notifie), puis résolution. */
  private async act<N extends RpcName>(fn: N, args: DuelRpc[N]['args']): Promise<DuelRpc[N]['returns']> {
    this.requireSignedIn()
    let out: DuelRpc[N]['returns']
    try {
      out = await this.call(fn, args)
    } catch (e) {
      throw this.userError(e)
    }
    // Relecture ratée : failLoad prévient et réessaie tout seul.
    if (this._signedIn && !(await this.reload())) this.emit()
    return out
  }
}

/** Le problème bloquant à afficher pour une erreur qui n'est ni une règle ni « pas connecté ». */
function problemFor(kind: ErrorKind): string {
  switch (kind) {
    case 'noFunction':
      return MESSAGES.dbNotReady
    case 'badKey':
      return MESSAGES.badKey
    case 'network':
      return MESSAGES.offline
    case 'rateLimit':
      return MESSAGES.rateLimit
    default:
      return MESSAGES.serverError
  }
}

// ─── Fabrique ─────────────────────────────────────────────────────────────────

/**
 * fetch avec un délai maximal : supabase-js n'en impose aucun, et un appel pendu (réseau
 * qui ne répond plus) bloquerait l'écran d'attente jusqu'au délai du navigateur. Au-delà,
 * la requête est coupée (« TimeoutError »), ce que la source traite comme une coupure.
 */
export function fetchWithTimeout(ms: number, base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return (input, init) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new DOMException('Délai dépassé', 'TimeoutError')), ms)
    const outer = init?.signal
    if (outer?.aborted) ctrl.abort(outer.reason)
    else outer?.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true })
    return base(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
  }
}

/** Un seul client par projet (React StrictMode crée la source deux fois en développement). */
const clients = new Map<string, SupabaseLike>()

/** La vraie source, branchée sur le projet Supabase (URL + clé publishable). */
export function createSupabaseSource(url: string, key: string, opts: { clock?: () => Date } = {}): SupabaseSource {
  const id = `${url}|${key}`
  let client = clients.get(id)
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY },
      global: { fetch: fetchWithTimeout(FETCH_TIMEOUT_MS) },
    })
    clients.set(id, client)
  }
  return new SupabaseSource({ client, clock: opts.clock })
}
