import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GAGES } from '../../config/defaults'
import { buildSeason } from '../../core/season'
import { drawStake } from '../../core/stake'
import type { BadgeUnlock, Checkin, DayKey, DuelSnapshot, GameSettings, Habit, Player, PlayerId, Proposal, WeekMeta } from '../../core/types'
import { deriveWeighIns, type RawWeighIn } from '../../core/weight'
import type { Activity } from '../source'
import type { EventKind, EventRow, RpcName } from './api'
import { classifyError, MESSAGES, type ErrorLike } from './errors'
import {
  FETCH_TIMEOUT_MS,
  fetchWithTimeout,
  initialSnapshot,
  normalizeSnapshot,
  POLL_MS,
  RELOAD_DEBOUNCE_MS,
  RETRY_MAX_MS,
  RETRY_MS,
  SupabaseSource,
  type ChannelLike,
  type ChannelStatus,
  type RpcResult,
  type SupabaseLike,
} from './SupabaseSource'

// ─── Un faux Supabase en mémoire ──────────────────────────────────────────────

/** Mercredi 18 novembre 2026, midi à Paris. */
const clock = () => new Date('2026-11-18T11:00:00Z')
const TODAY = '2026-11-18'

type ServerPlayer = Omit<Player, 'goalKg' | 'goalFromStartPct'>

interface ServerState {
  players: ServerPlayer[]
  habits: Habit[]
  checkins: Checkin[]
  weighIns: RawWeighIn[]
  weeks: WeekMeta[]
  settings: GameSettings
  proposals: Proposal[]
  codes: Record<PlayerId, string>
  seenResults: Record<PlayerId, DayKey[]>
  seenBadges: Record<PlayerId, string[]>
  badgeUnlocks: BadgeUnlock[]
}

function habit(playerId: PlayerId, name: string, kind: Habit['kind'], sortOrder: number): Habit {
  return {
    id: `${playerId}-${name}`,
    playerId,
    name,
    hint: '',
    emoji: kind === 'avoid' ? '🍪' : '🏃',
    kind,
    badgeKey: null,
    activeFrom: '2026-11-02',
    activeUntil: null,
    sortOrder,
  }
}

function serverState(): ServerState {
  return {
    players: [
      { id: 'laetitia', name: 'Laetitia', emoji: '🦊', color: '#FF6F61', showKg: false },
      { id: 'arthus', name: 'Arthus', emoji: '🐻', color: '#2E6BFF', showKg: false },
    ],
    habits: [
      habit('arthus', 'ongles', 'avoid', 0),
      habit('arthus', 'sport', 'do', 1),
      habit('laetitia', 'grattage', 'avoid', 0),
      habit('laetitia', 'sport', 'do', 1),
    ],
    checkins: [],
    weighIns: [
      { playerId: 'arthus', day: '2026-11-04', weightKg: 90 },
      { playerId: 'arthus', day: '2026-11-11', weightKg: 89.1 },
      { playerId: 'laetitia', day: '2026-11-04', weightKg: 70 },
      { playerId: 'laetitia', day: '2026-11-11', weightKg: 69.3 },
    ],
    weeks: [
      { weekStart: '2026-11-02', stake: DEFAULT_GAGES[0], gagePaid: {} },
      { weekStart: '2026-11-09', stake: DEFAULT_GAGES[1], gagePaid: {} },
      { weekStart: '2026-11-16', stake: DEFAULT_GAGES[2], gagePaid: {} },
    ],
    // Pesée le mercredi : on peut se peser « aujourd'hui » dans les tests.
    settings: { seasonStart: '2026-11-02', weighInDays: [{ from: '2026-11-02', isoDay: 3 }], gages: [...DEFAULT_GAGES] },
    proposals: [],
    codes: { arthus: '123456' },
    seenResults: {},
    seenBadges: {},
    badgeUnlocks: [],
  }
}

const ok = (data: unknown = null): RpcResult => ({ data, error: null })
const fail = (error: ErrorLike): RpcResult => ({ data: null, error })
const NOT_MEMBER: ErrorLike = { message: 'Connecte-toi d’abord 🔑', code: '28000' }
const NETWORK: ErrorLike = { message: 'TypeError: Failed to fetch', code: '' }
const NO_FUNCTION: ErrorLike = { message: 'Could not find the function public.get_snapshot without parameters', code: 'PGRST202' }

class FakeChannel implements ChannelLike {
  name: string
  removed = false
  private handler: ((payload: { new: EventRow }) => void) | null = null
  private statusCb: ((status: ChannelStatus) => void) | null = null

  constructor(name: string) {
    this.name = name
  }

  on(_type: 'postgres_changes', _filter: unknown, callback: (payload: { new: EventRow }) => void): ChannelLike {
    this.handler = callback
    return this
  }

  subscribe(callback?: (status: ChannelStatus) => void): ChannelLike {
    this.statusCb = callback ?? null
    // Comme supabase-js : branché un peu plus tard.
    queueMicrotask(() => this.statusCb?.('SUBSCRIBED'))
    return this
  }

  deliver(row: EventRow) {
    this.handler?.({ new: row })
  }

  status(status: ChannelStatus) {
    this.statusCb?.(status)
  }
}

/** Faux client : auth (session anonyme), RPC sur un état en mémoire, canaux temps réel. */
class FakeSupabase implements SupabaseLike {
  state = serverState()
  session: object | null = null
  /** Joueur auquel la session de ce téléphone est liée. */
  linkedTo: PlayerId | null = null
  anonDisabled = false
  calls: { fn: RpcName; args: Record<string, unknown> }[] = []
  channels: FakeChannel[] = []
  signOutCalls = 0
  anonSignIns = 0
  private authCallbacks = new Set<(event: string, session: object | null) => void>()
  private nextFailure = new Map<RpcName, { error: ErrorLike; status?: number }>()
  /** Nombre de codes faux effacés par le prochain clear_code_failures. */
  codeFailures = 0
  private gates = new Map<RpcName, { wait: Promise<void>; when: 'before' | 'after' }>()
  private eventId = 0

  auth: SupabaseLike['auth'] = {
    getSession: async () => ({ data: { session: this.session }, error: null }),
    signInAnonymously: async () => {
      this.anonSignIns++
      if (this.anonDisabled) {
        return { data: { session: null }, error: { message: 'Anonymous sign-ins are disabled', code: 'anonymous_provider_disabled', status: 422 } }
      }
      this.session = { access_token: `anon-${this.anonSignIns}` }
      this.linkedTo = null
      this.emitAuth('SIGNED_IN')
      return { data: { session: this.session }, error: null }
    },
    signOut: async () => {
      this.signOutCalls++
      this.session = null
      this.emitAuth('SIGNED_OUT')
      return { error: null }
    },
    onAuthStateChange: (callback) => {
      this.authCallbacks.add(callback)
      return { data: { subscription: { unsubscribe: () => this.authCallbacks.delete(callback) } } }
    },
  }

  emitAuth(event: string) {
    for (const cb of [...this.authCallbacks]) cb(event, this.session)
  }

  /** Un téléphone déjà connecté (session gardée, liée à ce joueur). */
  signedInAs(playerId: PlayerId): this {
    this.session = { access_token: 'gardée' }
    this.linkedTo = playerId
    return this
  }

  /** Le prochain appel à `fn` échoue avec cette erreur (et ce statut HTTP sur la réponse). */
  failNext(fn: RpcName, error: ErrorLike, status?: number) {
    this.nextFailure.set(fn, { error, status })
  }

  /**
   * Le prochain appel à `fn` attend qu'on ouvre la porte. 'before' : il calcule sa réponse
   * après l'ouverture ; 'after' : il la calcule tout de suite (réponse « ancienne » qui traîne).
   */
  gate(fn: RpcName, when: 'before' | 'after' = 'before'): () => void {
    let open!: () => void
    const wait = new Promise<void>((resolve) => (open = resolve))
    this.gates.set(fn, { wait, when })
    return open
  }

  count(fn: RpcName): number {
    return this.calls.filter((c) => c.fn === fn).length
  }

  argsOf(fn: RpcName): Record<string, unknown>[] {
    return this.calls.filter((c) => c.fn === fn).map((c) => c.args)
  }

  async rpc(fn: RpcName, args: object = {}): Promise<RpcResult> {
    const a = args as Record<string, unknown>
    this.calls.push({ fn, args: a })
    const gate = this.gates.get(fn)
    if (gate) this.gates.delete(fn)
    if (gate?.when === 'before') await gate.wait
    const failure = this.nextFailure.get(fn)
    if (failure) this.nextFailure.delete(fn)
    const result = failure ? { ...fail(failure.error), status: failure.status } : this.handle(fn, a)
    if (gate?.when === 'after') await gate.wait
    return result
  }

  channel(name: string): ChannelLike {
    const ch = new FakeChannel(name)
    this.channels.push(ch)
    return ch
  }

  async removeChannel(channel: ChannelLike): Promise<unknown> {
    ;(channel as FakeChannel).removed = true
    return 'ok'
  }

  get liveChannels(): FakeChannel[] {
    return this.channels.filter((c) => !c.removed)
  }

  /** Une ligne arrive dans public.events (temps réel). */
  event(playerId: PlayerId, kind: EventKind, day: DayKey | null = TODAY) {
    const row: EventRow = { id: ++this.eventId, player_id: playerId, kind, day, created_at: clock().toISOString() }
    for (const ch of this.liveChannels) ch.deliver(row)
  }

  snapshotFor(me: PlayerId): DuelSnapshot {
    const s = this.state
    const reveal = (pid: PlayerId) => pid === me || !!s.players.find((p) => p.id === pid)?.showKg
    return structuredClone({
      meId: me,
      players: s.players.map((p) => ({ ...p, goalKg: null, goalFromStartPct: null })),
      habits: s.habits,
      checkins: s.checkins,
      weighIns: deriveWeighIns(s.weighIns, () => null, reveal),
      weeks: s.weeks,
      settings: s.settings,
      proposals: s.proposals,
      seenResults: s.seenResults[me] ?? [],
      badgeUnlocks: s.badgeUnlocks,
      seenBadges: s.seenBadges[me] ?? [],
    })
  }

  private handle(fn: RpcName, a: Record<string, unknown>): RpcResult {
    const s = this.state
    if (fn === 'login_players') return ok(s.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, hasCode: !!s.codes[p.id] })))
    if (fn === 'claim_player') {
      if (!this.session) return fail(NOT_MEMBER)
      const pid = a.p_player as PlayerId
      const code = a.p_code as string
      if (!s.codes[pid]) s.codes[pid] = code
      else if (s.codes[pid] !== code) return fail({ message: 'Code incorrect 🙅', code: 'P0001' })
      this.linkedTo = pid
      return ok({ created: false })
    }
    if (fn === 'release_device') {
      this.linkedTo = null
      return ok()
    }
    const me = this.session ? this.linkedTo : null
    if (!me) return fail(NOT_MEMBER)
    switch (fn) {
      case 'get_snapshot':
        return ok(this.snapshotFor(me))
      case 'set_checkin': {
        s.checkins = s.checkins.filter((c) => !(c.playerId === me && c.habitId === a.p_habit && c.day === a.p_day))
        if (a.p_value) s.checkins.push({ playerId: me, habitId: a.p_habit as string, day: a.p_day as DayKey, value: a.p_value as Checkin['value'], updatedAt: 'serveur' })
        return ok()
      }
      case 'save_weigh_in':
        s.weighIns = [...s.weighIns.filter((w) => !(w.playerId === me && w.day === a.p_day)), { playerId: me, day: a.p_day as DayKey, weightKg: a.p_kg as number }]
        return ok()
      case 'update_profile':
        s.players = s.players.map((p) => (p.id === me ? { ...p, ...(a.p_patch as object) } : p))
        return ok()
      case 'ensure_stake': {
        const w = s.weeks.find((x) => x.weekStart === a.p_week)
        if (w?.stake) return ok(w.stake)
        if (w) w.stake = a.p_stake as string
        else s.weeks.push({ weekStart: a.p_week as DayKey, stake: a.p_stake as string, gagePaid: {} })
        return ok(a.p_stake)
      }
      case 'set_gage_paid': {
        const w = s.weeks.find((x) => x.weekStart === a.p_week)!
        w.gagePaid = { ...w.gagePaid, [a.p_player as string]: a.p_paid as boolean }
        return ok()
      }
      case 'mark_results_seen':
        s.seenResults[me] = [...(s.seenResults[me] ?? []), a.p_week as DayKey]
        return ok()
      case 'record_badge_unlocks':
        for (const u of a.p_unlocks as Omit<BadgeUnlock, 'playerId'>[]) s.badgeUnlocks.push({ ...u, playerId: me })
        return ok()
      case 'propose':
        return ok('proposition-1')
      case 'clear_code_failures': {
        const n = this.codeFailures
        this.codeFailures = 0
        return ok(n)
      }
      default:
        return ok()
    }
  }
}

// ─── Outils ───────────────────────────────────────────────────────────────────

/** Laisse passer les promesses et les minuteurs (horloge simulée). */
async function settle(ms = 0) {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0)
  if (ms > 0) await vi.advanceTimersByTimeAsync(ms)
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0)
}

interface Seen {
  snap: DuelSnapshot
  activity?: Activity
}

/** Démarre une source sur ce faux client et attend que tout soit calme (canal branché compris). */
async function boot(client: FakeSupabase) {
  const src = new SupabaseSource({ client, clock })
  const seen: Seen[] = []
  src.subscribe((snap, activity) => seen.push({ snap, activity }))
  await settle(RELOAD_DEBOUNCE_MS + 10)
  client.calls = []
  seen.length = 0
  return { src, seen }
}

function myCheckins(snap: DuelSnapshot, day = TODAY) {
  return snap.checkins.filter((c) => c.playerId === snap.meId && c.day === day)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ─── Démarrage ────────────────────────────────────────────────────────────────

describe('SupabaseSource · démarrage', () => {
  it('commence en chargement avec un snapshot de départ valide (garanties 2 et 7)', () => {
    const src = new SupabaseSource({ client: new FakeSupabase(), clock })
    expect(src.loading).toBe(true)
    expect(src.signedIn).toBe(false)
    expect(src.problem).toBeNull()
    const snap = src.getSnapshot()
    expect(snap.players).toHaveLength(2)
    expect(snap.players.map((p) => p.id)).toContain(snap.meId)
    expect(snap.checkins).toEqual([])
    // Les écrans calculent la saison même pendant l'attente : ça ne doit pas planter.
    expect(() => buildSeason(snap, TODAY)).not.toThrow()
    expect(() => buildSeason(snap, '2026-12-15')).not.toThrow()
  })

  it('sans session : déconnecté, après avoir vérifié que la base répond', async () => {
    const client = new FakeSupabase()
    const src = new SupabaseSource({ client, clock })
    const seen: Seen[] = []
    src.subscribe((snap) => seen.push({ snap }))
    await settle()
    expect(src.loading).toBe(false)
    expect(src.signedIn).toBe(false)
    expect(src.problem).toBeNull()
    expect(client.count('login_players')).toBe(1)
    expect(client.count('get_snapshot')).toBe(0)
    expect(seen.length).toBeGreaterThan(0)
    expect(client.channels).toHaveLength(0)
  })

  it('session gardée et liée : charge le snapshot, se connecte et branche le temps réel', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(src.loading).toBe(false)
    expect(src.signedIn).toBe(true)
    expect(src.getSnapshot().meId).toBe('arthus')
    expect(src.getSnapshot().habits).toHaveLength(4)
    expect(client.liveChannels).toHaveLength(1)
    // Canal branché : une relecture (on a pu rater des événements entre-temps).
    const before = client.count('get_snapshot')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.count('get_snapshot')).toBe(before + 1)
  })

  it('kilos de l’autre masqués, les miens visibles (garantie 3, faite par le serveur)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    const w = src.getSnapshot().weighIns
    expect(w.filter((x) => x.playerId === 'laetitia').every((x) => x.weightKg === null)).toBe(true)
    expect(w.filter((x) => x.playerId === 'arthus').every((x) => x.weightKg !== null)).toBe(true)
  })

  it('session pas liée à un joueur (28000) : déconnecté, sans problème', async () => {
    const client = new FakeSupabase()
    client.session = { access_token: 'orpheline' }
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(src.loading).toBe(false)
    expect(src.signedIn).toBe(false)
    expect(src.problem).toBeNull()
  })

  it('script SQL pas lancé (PGRST202) : problème qui dit quoi faire', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    client.failNext('get_snapshot', NO_FUNCTION)
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    // Téléphone déjà connecté : écran d'attente avec le problème (pas « Qui es-tu ? »).
    expect(src.loading).toBe(true)
    expect(src.signedIn).toBe(false)
    expect(src.problem).toContain('supabase/migrations/0001_duel.sql')
    expect(src.problem).toContain('pas prête')
  })

  it('base pas prête vue sans session (login_players absent) : même problème', async () => {
    const client = new FakeSupabase()
    client.failNext('login_players', NO_FUNCTION)
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(src.problem).toBe(MESSAGES.dbNotReady)
  })

  it('pas de réseau : problème, puis nouvel essai automatique qui répare tout', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    client.failNext('get_snapshot', NETWORK)
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(src.loading).toBe(true)
    expect(src.signedIn).toBe(false)
    expect(src.problem).toBe(MESSAGES.offline)
    await settle(RETRY_MS)
    expect(src.problem).toBeNull()
    expect(src.signedIn).toBe(true)
  })

  it('un snapshot mal formé (pas 2 joueurs) n’est pas appliqué', () => {
    expect(normalizeSnapshot({ meId: 'arthus', players: [{ id: 'arthus' }] })).toBeNull()
    expect(normalizeSnapshot({ meId: 'paul', players: [{ id: 'arthus' }, { id: 'laetitia' }] })).toBeNull()
    const ok = normalizeSnapshot({ meId: 'arthus', players: [{ id: 'arthus' }, { id: 'laetitia' }], settings: { seasonStart: '2026-11-02' } })
    expect(ok?.checkins).toEqual([])
    expect(ok?.settings.gages).toEqual([])
    expect(ok?.players[0].goalKg).toBeNull()
  })
})

// ─── Connexion ────────────────────────────────────────────────────────────────

describe('SupabaseSource · connexion', () => {
  it('signIn : session anonyme, claim_player, puis chargement et temps réel', async () => {
    const client = new FakeSupabase()
    const { src } = await boot(client)
    await src.signIn('arthus', '123456')
    expect(client.anonSignIns).toBe(1)
    expect(client.argsOf('claim_player')).toEqual([{ p_player: 'arthus', p_code: '123456' }])
    expect(client.count('get_snapshot')).toBe(1)
    expect(src.signedIn).toBe(true)
    expect(src.getSnapshot().meId).toBe('arthus')
    expect(client.liveChannels).toHaveLength(1)
  })

  it('code faux : message du serveur, toujours déconnecté ; la session anonyme est réutilisée', async () => {
    const client = new FakeSupabase()
    const { src } = await boot(client)
    await expect(src.signIn('arthus', '000000')).rejects.toThrow('Code incorrect 🙅')
    expect(src.signedIn).toBe(false)
    await src.signIn('arthus', '123456')
    expect(client.anonSignIns).toBe(1)
    expect(src.signedIn).toBe(true)
  })

  it('premier code pour un prénom : il devient le sien', async () => {
    const client = new FakeSupabase()
    const { src } = await boot(client)
    expect((await src.loginPlayers()).find((p) => p.id === 'laetitia')?.hasCode).toBe(false)
    await src.signIn('laetitia', '424242')
    expect(client.state.codes.laetitia).toBe('424242')
    expect(src.getSnapshot().meId).toBe('laetitia')
  })

  it('code mal formé : refusé sans appeler le serveur', async () => {
    const client = new FakeSupabase()
    const { src } = await boot(client)
    await expect(src.signIn('arthus', '12a456')).rejects.toThrow(MESSAGES.codeFormat)
    await expect(src.signIn('arthus', '12345')).rejects.toThrow(MESSAGES.codeFormat)
    expect(client.calls).toHaveLength(0)
    expect(client.anonSignIns).toBe(0)
  })

  it('connexion anonyme désactivée dans Supabase : dit où l’activer', async () => {
    const client = new FakeSupabase()
    client.anonDisabled = true
    const { src } = await boot(client)
    const err = await src.signIn('arthus', '123456').catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('Allow anonymous sign-ins')
    expect((err as Error).message).toContain('Authentication › Sign In / Providers')
    expect(client.count('claim_player')).toBe(0)
  })

  it('connexion pendant le démarrage : le démarrage ne déconnecte pas après coup', async () => {
    const client = new FakeSupabase()
    const open = client.gate('login_players')
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    await src.signIn('arthus', '123456')
    expect(src.signedIn).toBe(true)
    open()
    await settle()
    expect(src.signedIn).toBe(true)
    expect(src.getSnapshot().meId).toBe('arthus')
  })

  it('loginPlayers marche sans session', async () => {
    const client = new FakeSupabase()
    const { src } = await boot(client)
    const players = await src.loginPlayers()
    expect(players.map((p) => p.name)).toEqual(['Laetitia', 'Arthus'])
    expect(players.find((p) => p.id === 'arthus')?.hasCode).toBe(true)
  })

  it('changeCode : appelle change_code, erreurs en français', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    await src.changeCode('123456', '654321')
    expect(client.argsOf('change_code')).toEqual([{ p_old: '123456', p_new: '654321' }])
    client.failNext('change_code', { message: 'Ancien code incorrect 🙅', code: 'P0001' })
    await expect(src.changeCode('111111', '222222')).rejects.toThrow('Ancien code incorrect 🙅')
    await expect(src.changeCode('1', '222222')).rejects.toThrow(MESSAGES.codeFormat)
  })

  it('signOut : délie le téléphone, oublie la session, coupe le temps réel', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src, seen } = await boot(client)
    await src.signOut()
    expect(client.count('release_device')).toBe(1)
    expect(client.signOutCalls).toBe(1)
    expect(client.liveChannels).toHaveLength(0)
    expect(src.signedIn).toBe(false)
    expect(src.getSnapshot()).toEqual(initialSnapshot())
    expect(seen.at(-1)?.snap.checkins).toEqual([])
    // Plus de relecture ni de toast après la déconnexion.
    await settle(RELOAD_DEBOUNCE_MS * 4)
    expect(client.count('get_snapshot')).toBe(0)
  })

  it('signOut hors ligne : les erreurs sont ignorées, on est déconnecté quand même', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    client.failNext('release_device', NETWORK)
    await src.signOut()
    expect(src.signedIn).toBe(false)
    expect(client.signOutCalls).toBe(1)
  })

  it('session perdue (SIGNED_OUT d’Auth) : déconnecté', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    client.session = null
    client.emitAuth('SIGNED_OUT')
    await settle()
    expect(src.signedIn).toBe(false)
    expect(client.liveChannels).toHaveLength(0)
  })
})

// ─── Actions optimistes ───────────────────────────────────────────────────────

describe('SupabaseSource · mises à jour optimistes (garantie 1)', () => {
  it('setCheckin : effet local et notify AVANT la réponse du serveur', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src, seen } = await boot(client)
    const open = client.gate('set_checkin')
    let resolved = false
    const p = src.setCheckin(TODAY, 'arthus-ongles', 'nickel').then(() => (resolved = true))
    expect(seen).toHaveLength(1)
    expect(myCheckins(seen[0].snap)).toMatchObject([{ habitId: 'arthus-ongles', value: 'nickel' }])
    expect(myCheckins(src.getSnapshot())).toHaveLength(1)
    await settle()
    expect(resolved).toBe(false)
    open()
    await p
    expect(client.argsOf('set_checkin')).toEqual([{ p_day: TODAY, p_habit: 'arthus-ongles', p_value: 'nickel' }])
    expect(myCheckins(src.getSnapshot())).toHaveLength(1)
  })

  it('refus du serveur (P0001) : annulation, notify, puis rejet avec le message du serveur', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src, seen } = await boot(client)
    client.failNext('set_checkin', { message: 'Ce jour n’est plus modifiable 🔒', code: 'P0001' })
    await expect(src.setCheckin(TODAY, 'arthus-ongles', 'craquage')).rejects.toThrow('Ce jour n’est plus modifiable 🔒')
    expect(myCheckins(seen[0].snap)).toHaveLength(1)
    expect(myCheckins(seen.at(-1)!.snap)).toHaveLength(0)
    expect(myCheckins(src.getSnapshot())).toHaveLength(0)
    expect(client.count('get_snapshot')).toBe(1)
  })

  it('serveur injoignable : annulation et « Oups, le serveur n’a pas répondu 📶 Réessaie »', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    client.failNext('set_checkin', NETWORK)
    client.failNext('get_snapshot', NETWORK)
    await expect(src.setCheckin(TODAY, 'arthus-ongles', 'nickel')).rejects.toThrow('Oups, le serveur n’a pas répondu 📶 Réessaie')
    // La relecture a raté aussi : l'effet est retiré quand même, les données restent là, et
    // on prévient qu'elles datent peut-être un peu (on relit tout seuls).
    expect(myCheckins(src.getSnapshot())).toHaveLength(0)
    expect(src.signedIn).toBe(true)
    expect(src.problem).toBe(MESSAGES.stale)
    await settle(RETRY_MS + RELOAD_DEBOUNCE_MS)
    expect(src.problem).toBeNull()
  })

  it('28000 pendant une action : on repasse en déconnecté', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    client.failNext('set_checkin', NOT_MEMBER)
    await expect(src.setCheckin(TODAY, 'arthus-ongles', 'nickel')).rejects.toThrow('Connecte-toi d’abord 🔑')
    expect(src.signedIn).toBe(false)
    expect(src.getSnapshot()).toEqual(initialSnapshot())
  })

  it('pas de clignotement : une relecture pendant l’appel garde l’effet optimiste', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src, seen } = await boot(client)
    const open = client.gate('set_checkin')
    const p = src.setCheckin(TODAY, 'arthus-ongles', 'nickel')
    // L'autre joue entre-temps : relecture, sans mon check-in côté serveur.
    client.event('laetitia', 'checkin')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.count('get_snapshot')).toBe(1)
    expect(seen.every((s) => myCheckins(s.snap).length === 1)).toBe(true)
    open()
    await p
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(myCheckins(src.getSnapshot())).toMatchObject([{ value: 'nickel', updatedAt: 'serveur' }])
  })

  it('saveWeighIn : recalcule mes % tout de suite (deriveWeighIns)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src, seen } = await boot(client)
    const open = client.gate('save_weigh_in')
    const p = src.saveWeighIn(TODAY, 88.24)
    const mine = seen[0].snap.weighIns.filter((w) => w.playerId === 'arthus')
    expect(mine.map((w) => w.day)).toEqual(['2026-11-04', '2026-11-11', TODAY])
    const today = mine.at(-1)!
    expect(today.weightKg).toBe(88.2)
    expect(today.changePct).toBeCloseTo(((88.2 - 89.1) / 89.1) * 100, 6)
    expect(today.fromStartPct).toBeCloseTo(((88.2 - 90) / 90) * 100, 6)
    // Les pesées de l'autre ne bougent pas (toujours sans kilos).
    expect(seen[0].snap.weighIns.filter((w) => w.playerId === 'laetitia').every((w) => w.weightKg === null)).toBe(true)
    open()
    await p
    expect(client.argsOf('save_weigh_in')).toEqual([{ p_day: TODAY, p_kg: 88.2 }])
  })

  it('updateProfile, markResultsSeen, markBadgesSeen, setGagePaid : effet immédiat', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    const opens = (['update_profile', 'mark_results_seen', 'mark_badges_seen', 'set_gage_paid'] as RpcName[]).map((fn) => client.gate(fn))
    const all = Promise.all([
      src.updateProfile({ name: '  Tutu ', color: '#10B981' }),
      src.markResultsSeen('2026-11-09'),
      src.markBadgesSeen(['a', 'a', 'b']),
      src.setGagePaid('2026-11-09', 'laetitia', true),
    ])
    const snap = src.getSnapshot()
    expect(snap.players.find((p) => p.id === 'arthus')).toMatchObject({ name: 'Tutu', color: '#10B981' })
    expect(snap.seenResults).toEqual(['2026-11-09'])
    expect(snap.seenBadges).toEqual(['a', 'b'])
    expect(snap.weeks.find((w) => w.weekStart === '2026-11-09')?.gagePaid).toEqual({ laetitia: true })
    opens.forEach((open) => open())
    await all
    expect(client.argsOf('update_profile')).toEqual([{ p_patch: { name: 'Tutu', color: '#10B981' } }])
    expect(client.argsOf('mark_badges_seen')).toEqual([{ p_keys: ['a', 'b'] }])
    // Déjà vu : pas d'appel inutile.
    await src.markResultsSeen('2026-11-09')
    expect(client.count('mark_results_seen')).toBe(1)
  })

  it('setGagePaid pour moi-même : refusé tout de suite (c’est à l’autre de valider)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src, seen } = await boot(client)
    await expect(src.setGagePaid('2026-11-09', 'arthus', true)).rejects.toThrow(MESSAGES.notYourGage)
    expect(seen).toHaveLength(0)
    expect(client.calls).toHaveLength(0)
  })

  it('une action sans être connecté : refusée en français', async () => {
    const client = new FakeSupabase()
    const { src } = await boot(client)
    await expect(src.setCheckin(TODAY, 'arthus-ongles', 'nickel')).rejects.toThrow('Connecte-toi d’abord 🔑')
    await expect(src.propose({ kind: 'weigh_day', isoDay: 7 })).rejects.toThrow('Connecte-toi d’abord 🔑')
  })
})

// ─── Autres actions ───────────────────────────────────────────────────────────

describe('SupabaseSource · autres actions', () => {
  it('propose : seulement la proposition (l’acceptation d’office ne se demande pas, SEC-2), puis relecture et notify avant de résoudre', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src, seen } = await boot(client)
    await src.propose({ kind: 'weigh_day', isoDay: 7 })
    expect(client.argsOf('propose')).toEqual([{ p_payload: { kind: 'weigh_day', isoDay: 7 } }])
    expect(client.calls.map((c) => c.fn)).toEqual(['propose', 'get_snapshot'])
    expect(seen.length).toBeGreaterThan(0)
  })

  it('setStake, setGages, answerProposal, cancelProposal : noms et paramètres du contrat', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    await src.setStake('2026-11-16', ' Massage 💆 ')
    await src.setGages(['A', ' ', 'B '])
    await src.answerProposal('p1', true)
    await src.cancelProposal('p2')
    expect(client.argsOf('set_stake')).toEqual([{ p_week: '2026-11-16', p_stake: 'Massage 💆' }])
    expect(client.argsOf('set_gages')).toEqual([{ p_gages: ['A', 'B'] }])
    expect(client.argsOf('answer_proposal')).toEqual([{ p_id: 'p1', p_accept: true }])
    expect(client.argsOf('cancel_proposal')).toEqual([{ p_id: 'p2' }])
  })

  it('refus du serveur sur une action non optimiste : message tel quel', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    client.failNext('set_stake', { message: 'L’enjeu est verrouillé 🔒', code: 'P0001' })
    await expect(src.setStake('2026-11-09', 'X')).rejects.toThrow('L’enjeu est verrouillé 🔒')
  })

  it('recordBadgeUnlocks : seulement mes badges, une seule fois même si on redemande pendant l’appel', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    // −2 % depuis le départ aujourd'hui : 🪶 palier 2 débloqué d'après le serveur.
    client.state.weighIns.push({ playerId: 'arthus', day: TODAY, weightKg: 88.2 })
    const { src } = await boot(client)
    const mine: BadgeUnlock = { playerId: 'arthus', badgeId: 'plume', tier: 2, day: TODAY }
    const theirs: BadgeUnlock = { playerId: 'laetitia', badgeId: 'zen', tier: null, day: TODAY }
    const open = client.gate('record_badge_unlocks')
    const first = src.recordBadgeUnlocks([mine, theirs])
    await src.recordBadgeUnlocks([mine])
    open()
    await first
    expect(client.argsOf('record_badge_unlocks')).toEqual([{ p_unlocks: [{ badgeId: 'plume', tier: 2, day: TODAY }] }])
    await src.recordBadgeUnlocks([mine])
    expect(client.count('record_badge_unlocks')).toBe(1)
  })
})

// ─── Temps réel ───────────────────────────────────────────────────────────────

describe('SupabaseSource · temps réel', () => {
  it('événement de l’autre : relecture puis toast (garantie 4)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src, seen } = await boot(client)
    client.state.checkins.push({ playerId: 'laetitia', habitId: 'laetitia-sport', day: TODAY, value: 'fait', updatedAt: 'x' })
    client.event('laetitia', 'checkin_done')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(seen).toHaveLength(1)
    expect(seen[0].activity).toEqual({ kind: 'checkin_done', playerId: 'laetitia', text: '👀 Laetitia vient de faire son check‑in' })
    expect(src.getSnapshot().checkins).toHaveLength(1)
  })

  it('mes propres événements (écho, autre téléphone) : relecture mais jamais de toast', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { seen } = await boot(client)
    client.event('arthus', 'checkin_done')
    client.event('arthus', 'weighin')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.count('get_snapshot')).toBe(1)
    expect(seen.every((s) => s.activity === undefined)).toBe(true)
  })

  it('un check-in à moitié rempli ou un badge : le Ring bouge, sans toast', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { seen } = await boot(client)
    client.event('laetitia', 'checkin')
    client.event('laetitia', 'badge')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(seen).toHaveLength(1)
    expect(seen[0].activity).toBeUndefined()
  })

  it('anti-rebond : des événements rapprochés ne font qu’une relecture, avec le dernier toast', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { seen } = await boot(client)
    client.event('laetitia', 'checkin')
    await settle(80)
    client.event('laetitia', 'checkin')
    await settle(80)
    client.event('laetitia', 'checkin_done')
    expect(client.count('get_snapshot')).toBe(0)
    await settle(RELOAD_DEBOUNCE_MS)
    expect(client.count('get_snapshot')).toBe(1)
    expect(seen.map((s) => s.activity?.kind)).toEqual(['checkin_done'])
  })

  it('le toast prend le prénom à jour et dit si le gage a été validé ou annulé', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { seen } = await boot(client)
    client.state.players[0].name = 'Laeti'
    client.state.weeks[1].gagePaid = { arthus: true }
    client.event('laetitia', 'gage_paid', '2026-11-09')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(seen.at(-1)?.activity?.text).toMatch(/^🫡 Laeti a validé ton gage/)
    client.state.weeks[1].gagePaid = { arthus: false }
    client.event('laetitia', 'gage_paid', '2026-11-09')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(seen.at(-1)?.activity?.text).toMatch(/^↩️ Laeti a annulé/)
  })

  it('enjeu : toast si l’autre l’a changé, pas pour le tirage automatique du lundi', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { seen } = await boot(client)
    const auto = drawStake(client.state.settings.gages, '2026-11-16', client.state.weeks[1].stake)
    client.state.weeks[2].stake = auto
    client.event('laetitia', 'stake', '2026-11-16')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(seen.at(-1)?.activity).toBeUndefined()
    client.state.weeks[2].stake = 'Gage maison 🏠'
    client.event('laetitia', 'stake', '2026-11-16')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(seen.at(-1)?.activity?.text).toBe('🎲 Laetitia a changé l’enjeu de la semaine')
  })

  it('une réponse plus ancienne qu’une lecture déjà appliquée est ignorée', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    // Lecture 1 : sa réponse (sans le check-in) traîne sur le réseau.
    const open = client.gate('get_snapshot', 'after')
    client.event('laetitia', 'checkin')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    // Lecture 2 : voit le check-in, arrive en premier.
    client.state.checkins.push({ playerId: 'laetitia', habitId: 'laetitia-sport', day: TODAY, value: 'fait', updatedAt: 'x' })
    client.event('laetitia', 'checkin_done')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(src.getSnapshot().checkins).toHaveLength(1)
    open()
    await settle()
    expect(client.count('get_snapshot')).toBe(2)
    expect(src.getSnapshot().checkins).toHaveLength(1)
  })

  it('retour au premier plan et retour du réseau : relecture', async () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    const win = new EventTarget()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', win)
    const client = new FakeSupabase().signedInAs('arthus')
    await boot(client)
    doc.dispatchEvent(new Event('visibilitychange'))
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.count('get_snapshot')).toBe(1)
    win.dispatchEvent(new Event('online'))
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.count('get_snapshot')).toBe(2)
    // Passer en arrière-plan ne relit pas.
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.count('get_snapshot')).toBe(2)
  })

  it('retour du réseau après un démarrage raté : on redémarre sans attendre', async () => {
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    const client = new FakeSupabase().signedInAs('arthus')
    client.failNext('get_snapshot', NETWORK)
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(src.problem).toBe(MESSAGES.offline)
    win.dispatchEvent(new Event('online'))
    await settle()
    expect(src.signedIn).toBe(true)
    expect(src.problem).toBeNull()
  })
})

// ─── Enjeu automatique ────────────────────────────────────────────────────────

describe('SupabaseSource · enjeu automatique (garantie 5)', () => {
  it('chaque manche commencée sans enjeu reçoit le tirage de drawStake (via ensure_stake)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    client.state.weeks = [{ weekStart: '2026-11-02', stake: 'Gage perso', gagePaid: {} }]
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    const gages = client.state.settings.gages
    const w2 = drawStake(gages, '2026-11-09', 'Gage perso')
    const w3 = drawStake(gages, '2026-11-16', w2)
    expect(client.argsOf('ensure_stake')).toEqual([
      { p_week: '2026-11-09', p_stake: w2 },
      { p_week: '2026-11-16', p_stake: w3 },
    ])
    // Relu après le tirage : les enjeux sont dans le snapshot, plus d'autre appel.
    expect(src.getSnapshot().weeks.map((w) => w.stake)).toEqual(['Gage perso', w2, w3])
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.count('ensure_stake')).toBe(2)
  })

  it('pas de tirage avant le début du duel, ni si tout est déjà tiré', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    client.state.settings.seasonStart = '2026-11-23'
    client.state.weeks = []
    await boot(client)
    expect(client.count('ensure_stake')).toBe(0)
  })

  it('tirage refusé (réseau) : pas de boucle, on réessaie au prochain chargement', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    client.state.weeks = client.state.weeks.slice(0, 2)
    client.failNext('ensure_stake', NETWORK)
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(client.count('ensure_stake')).toBe(1)
    expect(src.getSnapshot().weeks).toHaveLength(2)
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.count('ensure_stake')).toBe(2)
    expect(src.getSnapshot().weeks).toHaveLength(3)
  })
})

// ─── React StrictMode ─────────────────────────────────────────────────────────

describe('SupabaseSource · dispose puis nouvel abonnement (StrictMode)', () => {
  it('dispose coupe tout ; subscribe relance proprement sur la même instance', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const src = new SupabaseSource({ client, clock })
    const first: Seen[] = []
    const second: Seen[] = []
    // Montage, démontage, remontage immédiats (comme React StrictMode en développement).
    const unsubscribe = src.subscribe((snap) => first.push({ snap }))
    unsubscribe()
    src.dispose()
    src.subscribe((snap, activity) => second.push({ snap, activity }))
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(first).toHaveLength(0)
    expect(src.signedIn).toBe(true)
    expect(client.liveChannels).toHaveLength(1)
    // Un seul écouteur d'Auth actif.
    client.session = null
    client.emitAuth('SIGNED_OUT')
    await settle()
    expect(src.signedIn).toBe(false)
  })

  it('après dispose : plus de relecture, plus de canal ; les événements d’un vieux canal sont ignorés', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    const oldChannel = client.liveChannels[0]
    src.dispose()
    expect(oldChannel.removed).toBe(true)
    oldChannel.deliver({ id: 1, player_id: 'laetitia', kind: 'checkin_done', day: TODAY, created_at: '' })
    await settle(RELOAD_DEBOUNCE_MS * 4)
    expect(client.count('get_snapshot')).toBe(0)
    // Remonté : nouveau canal (nouveau nom), et le temps réel remarche.
    const seen: Seen[] = []
    src.subscribe((snap, activity) => seen.push({ snap, activity }))
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.liveChannels).toHaveLength(1)
    expect(client.liveChannels[0].name).not.toBe(oldChannel.name)
    seen.length = 0
    client.event('laetitia', 'weighin')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(seen.map((s) => s.activity?.kind)).toEqual(['weighin'])
  })

  it('un démarrage d’avant dispose ne fait rien (pas de double canal)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const open = client.gate('get_snapshot')
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    src.dispose()
    src.subscribe(() => {})
    open()
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(client.liveChannels).toHaveLength(1)
    expect(src.signedIn).toBe(true)
  })
})

// ─── Démarrage et relectures robustes (relecture client C1 à C7) ─────────────

describe('SupabaseSource · démarrage robuste', () => {
  it('session gardée, une lecture ratée : écran d’attente (pas « Qui es-tu ? »), et la reprise ne se perd pas (C1, C5)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    client.failNext('get_snapshot', NETWORK)
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(src).toMatchObject({ loading: true, signedIn: false, problem: MESSAGES.offline })
    // L'écran de connexion d'avant appelait loginPlayers : ça effaçait le problème et plus
    // rien ne relançait le démarrage. Maintenant, ça le relance.
    await src.loginPlayers()
    await settle()
    expect(src).toMatchObject({ loading: false, signedIn: true, problem: null })
    expect(client.count('get_snapshot')).toBeGreaterThanOrEqual(2)
  })

  it('session gardée hors ligne : on attend sans redemander le code, nouvel essai à délai croissant, « Réessayer » tout de suite (C1, C5)', async () => {
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    const client = new FakeSupabase().signedInAs('arthus')
    for (let i = 0; i < 3; i++) client.failNext('get_snapshot', NETWORK)
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(src.loading).toBe(true)
    expect(client.count('get_snapshot')).toBe(1)
    // Nouvel essai au bout de RETRY_MS, puis du double.
    client.failNext('get_snapshot', NETWORK)
    await settle(RETRY_MS)
    expect(client.count('get_snapshot')).toBe(2)
    client.failNext('get_snapshot', NETWORK)
    await settle(RETRY_MS)
    expect(client.count('get_snapshot')).toBe(2)
    await settle(RETRY_MS)
    expect(client.count('get_snapshot')).toBe(3)
    expect(src).toMatchObject({ loading: true, signedIn: false, problem: MESSAGES.offline })
    // « Réessayer » : tout de suite, sans attendre le minuteur.
    src.retry()
    await settle()
    expect(client.count('get_snapshot')).toBe(4)
    expect(src).toMatchObject({ loading: false, signedIn: true, problem: null })
    // Le délai repart de zéro, et une minute plus tard rien ne traîne.
    await settle(RETRY_MAX_MS)
    expect(src.signedIn).toBe(true)
  })

  it('démarrage pendu (requête sans réponse) : « Réessayer » et le retour du réseau relancent (C7)', async () => {
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    const client = new FakeSupabase().signedInAs('arthus')
    client.gate('get_snapshot') // jamais ouverte
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(src.loading).toBe(true)
    // Retour du réseau juste après : on ne double pas une requête toute fraîche…
    win.dispatchEvent(new Event('online'))
    await settle()
    expect(client.count('get_snapshot')).toBe(1)
    // … mais au-delà du délai maximal d'une requête, si.
    await settle(FETCH_TIMEOUT_MS + 1)
    win.dispatchEvent(new Event('online'))
    await settle()
    expect(client.count('get_snapshot')).toBe(2)
    expect(src.signedIn).toBe(true)

    // Sans aucun événement : le garde-fou le dit et relance tout seul (client sans délai maximal).
    const lone = new FakeSupabase().signedInAs('arthus')
    lone.gate('get_snapshot')
    const src3 = new SupabaseSource({ client: lone, clock })
    src3.subscribe(() => {})
    await settle(FETCH_TIMEOUT_MS)
    expect(src3).toMatchObject({ loading: true, problem: null })
    lone.gate('get_snapshot') // le 2e essai pend aussi
    await settle(1000)
    expect(src3).toMatchObject({ loading: true, problem: MESSAGES.offline })
    expect(lone.count('get_snapshot')).toBe(2)
    await settle(FETCH_TIMEOUT_MS + 1000)
    expect(lone.count('get_snapshot')).toBe(3)
    expect(src3).toMatchObject({ loading: false, signedIn: true, problem: null })

    // Même chose avec « Réessayer », sans attendre.
    const client2 = new FakeSupabase().signedInAs('laetitia')
    client2.gate('get_snapshot')
    const src2 = new SupabaseSource({ client: client2, clock })
    src2.subscribe(() => {})
    await settle()
    src2.retry()
    await settle()
    expect(src2.signedIn).toBe(true)
    expect(src2.getSnapshot().meId).toBe('laetitia')
  })

  it('fetchWithTimeout : une requête trop longue est coupée (TimeoutError), une annulation extérieure passe (C7)', async () => {
    const never = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))
    const f = fetchWithTimeout(FETCH_TIMEOUT_MS, never as typeof fetch)
    const slow = f('https://abcd.supabase.co/rest/v1/rpc/get_snapshot', { method: 'POST' }).catch((e: Error) => e)
    await settle(FETCH_TIMEOUT_MS)
    const err = (await slow) as Error
    expect(err.name).toBe('TimeoutError')
    // Classée comme une coupure réseau (message de postgrest-js : « TimeoutError: … »).
    expect(classifyError({ message: `${err.name}: ${err.message}`, code: '', status: 0 })).toBe('network')

    const outer = new AbortController()
    const aborted = f('https://abcd.supabase.co', { signal: outer.signal }).catch((e: Error) => e)
    outer.abort(new DOMException('stop', 'AbortError'))
    expect(((await aborted) as Error).name).toBe('AbortError')
    // Une réponse rapide passe telle quelle.
    const quick = fetchWithTimeout(FETCH_TIMEOUT_MS, (async () => new Response('ok')) as typeof fetch)
    expect(await (await quick('https://abcd.supabase.co')).text()).toBe('ok')
  })

  it('clé refusée (401 « Invalid API key ») : message qui dit quoi vérifier, sans réessayer sans fin (C3)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    client.failNext('get_snapshot', { message: 'Invalid API key', code: null }, 401)
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle(5 * 60_000)
    expect(src.problem).toBe(MESSAGES.badKey)
    expect(client.count('get_snapshot')).toBe(1)

    // Sans session : l'écran de connexion le dit aussi (pas « vérifie ta connexion »).
    const fresh = new FakeSupabase()
    fresh.failNext('login_players', { message: '', code: '' }, 401)
    const src2 = new SupabaseSource({ client: fresh, clock })
    src2.subscribe(() => {})
    await settle(5 * 60_000)
    expect(src2).toMatchObject({ loading: false, signedIn: false, problem: MESSAGES.badKey })
    expect(fresh.count('login_players')).toBe(1)
  })

  it('erreur SQL du serveur (pas le réseau) : « Le serveur a répondu une erreur », et on réessaie (C3)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    client.failNext('get_snapshot', { message: 'relation "duel.players" does not exist', code: '42P01' }, 404)
    const src = new SupabaseSource({ client, clock })
    src.subscribe(() => {})
    await settle()
    expect(src.problem).toBe(MESSAGES.serverError)
    expect(src.problem).not.toContain('connexion')
    await settle(RETRY_MS)
    expect(src).toMatchObject({ signedIn: true, problem: null })
  })

  it('premier code enregistré mais relecture ratée : pas d’échec, écran d’attente puis connexion toute seule (C6)', async () => {
    const client = new FakeSupabase()
    const { src } = await boot(client)
    client.failNext('get_snapshot', NETWORK)
    await expect(src.signIn('laetitia', '654321')).resolves.toBeUndefined()
    expect(client.state.codes.laetitia).toBe('654321')
    expect(src).toMatchObject({ loading: true, signedIn: false, problem: MESSAGES.offline })
    await settle(RETRY_MS)
    expect(src).toMatchObject({ loading: false, signedIn: true, problem: null })
    expect(src.getSnapshot().meId).toBe('laetitia')
  })
})

describe('SupabaseSource · relectures quand on est connecté (C2)', () => {
  it('relecture ratée après un événement : bandeau « pas à jour », puis nouvel essai qui montre le check-in', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src, seen } = await boot(client)
    client.state.checkins.push({ playerId: 'laetitia', habitId: 'laetitia-sport', day: TODAY, value: 'fait', updatedAt: 'x' })
    client.failNext('get_snapshot', NETWORK)
    client.event('laetitia', 'checkin_done')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    expect(src.problem).toBe(MESSAGES.stale)
    expect(src.getSnapshot().checkins).toHaveLength(0)
    await settle(RETRY_MS + RELOAD_DEBOUNCE_MS)
    expect(src.problem).toBeNull()
    expect(src.getSnapshot().checkins).toHaveLength(1)
    // Le toast arrive avec la relecture réussie.
    expect(seen.map((s) => s.activity?.kind).filter(Boolean)).toEqual(['checkin_done'])
  })

  it('action réussie mais relecture ratée : la proposition finit par apparaître', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    client.failNext('get_snapshot', NETWORK)
    await src.propose({ kind: 'weigh_day', isoDay: 6 })
    client.state.proposals.push({
      id: 'proposition-1', authorId: 'arthus', payload: { kind: 'weigh_day', isoDay: 6 }, status: 'pending',
      createdAt: clock().toISOString(), decidedAt: null, effectiveFrom: null,
    })
    expect(src.getSnapshot().proposals).toHaveLength(0)
    await settle(RETRY_MS + RELOAD_DEBOUNCE_MS)
    expect(src.getSnapshot().proposals).toHaveLength(1)
  })

  it('temps réel muet (canal en erreur) : une relecture par minute quand l’app est à l’écran, pas en arrière-plan', async () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    vi.stubGlobal('document', doc)
    const client = new FakeSupabase().signedInAs('arthus')
    const { src } = await boot(client)
    client.liveChannels[0].status('CHANNEL_ERROR')
    client.state.checkins.push({ playerId: 'laetitia', habitId: 'laetitia-sport', day: TODAY, value: 'fait', updatedAt: 'x' })
    await settle(POLL_MS + RELOAD_DEBOUNCE_MS)
    expect(src.getSnapshot().checkins).toHaveLength(1)
    expect(client.count('get_snapshot')).toBe(1)
    await settle(3 * POLL_MS)
    expect(client.count('get_snapshot')).toBe(4)
    // En arrière-plan : rien.
    doc.visibilityState = 'hidden'
    await settle(5 * POLL_MS)
    expect(client.count('get_snapshot')).toBe(4)
    // Le temps réel relit souvent : pas de relecture de secours en plus.
    doc.visibilityState = 'visible'
    for (let i = 0; i < 9; i++) {
      client.event('laetitia', 'checkin')
      await settle(POLL_MS / 3)
    }
    expect(client.count('get_snapshot')).toBe(4 + 9)
    src.dispose()
    await settle(5 * POLL_MS)
    expect(client.count('get_snapshot')).toBe(4 + 9)
  })
})

describe('SupabaseSource · badges et code (C4, SEC-3)', () => {
  it('un badge n’est jamais gravé d’après un check-in que le serveur n’a pas (encore) confirmé (C4)', async () => {
    const client = new FakeSupabase().signedInAs('arthus')
    // Six jours complets d'affilée, et aujourd'hui à moitié : le 7e jour complet donnerait 📅 Assidu·e.
    for (const day of ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', TODAY]) {
      client.state.checkins.push({ playerId: 'arthus', habitId: 'arthus-ongles', day, value: 'nickel', updatedAt: 'x' })
      if (day !== TODAY) client.state.checkins.push({ playerId: 'arthus', habitId: 'arthus-sport', day, value: 'fait', updatedAt: 'x' })
    }
    const { src } = await boot(client)
    const assidu: BadgeUnlock = { playerId: 'arthus', badgeId: 'assidu', tier: null, day: TODAY }
    // Le check-in optimiste part ; le Provider voit le badge et demande à le graver.
    const open = client.gate('set_checkin')
    client.failNext('set_checkin', { message: 'Ce jour n’est plus modifiable 🔒', code: 'P0001' })
    const pending = src.setCheckin(TODAY, 'arthus-sport', 'fait').catch((e: Error) => e)
    expect(src.getSnapshot().checkins.filter((c) => c.day === TODAY && c.playerId === 'arthus')).toHaveLength(2)
    await src.recordBadgeUnlocks([assidu])
    expect(client.count('record_badge_unlocks')).toBe(0)
    open()
    expect(((await pending) as Error).message).toBe('Ce jour n’est plus modifiable 🔒')
    // Demande en retard (calculée sur l'ancien snapshot optimiste) : le serveur n'a pas ce
    // check-in, le jour n'est pas complet → rien n'est gravé.
    await src.recordBadgeUnlocks([assidu])
    expect(client.count('record_badge_unlocks')).toBe(0)
    expect(client.state.badgeUnlocks).toEqual([])
    // Accepté cette fois : le badge est bien gravé.
    await src.setCheckin(TODAY, 'arthus-sport', 'fait')
    await settle(RELOAD_DEBOUNCE_MS + 10)
    await src.recordBadgeUnlocks([assidu])
    expect(client.argsOf('record_badge_unlocks')).toEqual([{ p_unlocks: [{ badgeId: 'assidu', tier: null, day: TODAY }] }])
  })

  it('unlockCode : clear_code_failures, renvoie le nombre de codes faux effacés (SEC-3)', async () => {
    const client = new FakeSupabase().signedInAs('laetitia')
    const { src } = await boot(client)
    client.codeFailures = 12
    expect(await src.unlockCode()).toBe(12)
    expect(await src.unlockCode()).toBe(0)
    expect(client.count('clear_code_failures')).toBe(2)
    const out = new SupabaseSource({ client: new FakeSupabase(), clock })
    await expect(out.unlockCode()).rejects.toThrow(MESSAGES.notMember)
  })
})
