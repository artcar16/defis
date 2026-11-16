/**
 * 🤝 Test de CONTRAT, bout en bout : de vraies SupabaseSource (le code de l'app) parlent à la
 * VRAIE migration (supabase/migrations/0001_duel.sql), qui tourne dans PGlite (./pglite.ts).
 *
 * Chaque « téléphone » est un faux client SupabaseLike branché sur la même base :
 * - auth : la session anonyme gardée par le téléphone (signInAnonymously → un nouvel
 *   utilisateur dans auth.users ; signOut l'oublie) ;
 * - rpc : le harnais PGlite, avec l'uid de la session (rôle authenticated) ou sans (anon) ;
 * - temps réel : après chaque appel, chaque canal branché reçoit les nouvelles lignes de
 *   public.events qu'il a le droit de lire, lues EN TANT QUE sa session (RLS), comme Realtime.
 *
 * Trois téléphones : Arthus (📱), Laetitia (📱) et le 2e téléphone d'Arthus (📱 bis).
 * On vérifie ce que voit chaque écran : snapshot, toasts, messages d'erreur.
 */
import { TZDate } from '@date-fns/tz'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GAGES, DEFAULT_HABITS, DEFAULT_PLAYERS, SEASON_START } from '../../config/defaults'
import { badgeUnlocksToRecord, computeBadges } from '../../core/badges'
import { addDays, daysRange } from '../../core/dates'
import { NBSP } from '../../core/fr'
import { isInGoalZone, percentChange, weighInPoints } from '../../core/scoring'
import { buildSeason, pendingResultsWeek } from '../../core/season'
import { drawStake } from '../../core/stake'
import type { CheckinValue, DayKey, DuelSnapshot, Habit, PlayerId, Proposal } from '../../core/types'
import { activityText, type ActivityKind } from '../activity'
import { maskWeighIn, pctHalf } from '../mask'
import type { Activity } from '../source'
import type { EventKind, EventRow, RpcName } from './api'
import { MESSAGES } from './errors'
import { createTestDb, type TestDb } from './pglite'
import {
  initialSnapshot,
  RELOAD_DEBOUNCE_MS,
  SupabaseSource,
  type ChannelLike,
  type ChannelStatus,
  type EventsFilter,
  type RpcResult,
  type SessionLike,
  type SupabaseLike,
} from './SupabaseSource'

// PGlite démarre en ~3 s ; une semaine complète de check-ins prend quelques secondes.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const A: PlayerId = 'arthus'
const L: PlayerId = 'laetitia'
const CODE_A = '123456'
const CODE_L = '111111'

let t: TestDb

// ─── Horloge commune (serveur + téléphones) ──────────────────────────────────

let nowMs = 0
const clock = () => new Date(nowMs)

/** L'instant correspondant à une heure de Paris. */
function paris(day: DayKey, hour = 12, minute = 0): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(new TZDate(y, m - 1, d, hour, minute, 0, 0, 'Europe/Paris').getTime())
}

/** Avance (ou recule) l'heure, côté serveur (duel.now()) ET côté téléphones. */
async function setNow(day: DayKey, hour = 12, minute = 0) {
  const at = paris(day, hour, minute)
  nowMs = at.getTime()
  await t.setNow(at)
}

// ─── Activité en cours (pour attendre que tout soit calme) ───────────────────

let busy = 0
const sleep = (ms: number) => new Promise<void>((resolve) => realSetTimeout(resolve, ms))

async function track<T>(work: () => Promise<T>): Promise<T> {
  busy++
  try {
    return await work()
  } finally {
    busy--
  }
}

/**
 * Minuteurs courts des sources (relecture regroupée à RELOAD_DEBOUNCE_MS, petits reports à 0 ms)
 * encore en attente. setTimeout est enveloppé pour ce fichier seulement (Vitest isole chaque
 * fichier) : le comportement ne change pas, on compte juste ce qui reste à partir.
 */
const pendingTimers = new Set<unknown>()
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout
globalThis.setTimeout = ((handler: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  const watched = ms === RELOAD_DEBOUNCE_MS || !ms
  const id: unknown = realSetTimeout(() => {
    pendingTimers.delete(id)
    handler(...args)
  }, ms)
  if (watched) pendingTimers.add(id)
  return id
}) as typeof setTimeout
globalThis.clearTimeout = ((id?: Parameters<typeof clearTimeout>[0]) => {
  pendingTimers.delete(id)
  realClearTimeout(id)
}) as typeof clearTimeout

/**
 * Attend que plus rien ne bouge : aucun appel en cours, aucun événement à livrer, aucune
 * relecture programmée, et ce plusieurs fois de suite (les suites d'une réponse passent par
 * des micro-tâches).
 */
async function settle() {
  const started = Date.now()
  let calm = 0
  for (;;) {
    await sleep(5)
    calm = busy === 0 && realtime.pending === 0 && pendingTimers.size === 0 ? calm + 1 : 0
    if (calm >= 4) return
    if (Date.now() - started > 15_000) throw new Error('Les téléphones ne se calment pas (relectures en boucle ?)')
  }
}

// ─── Faux Realtime : public.events, lu en tant que chaque abonné (RLS) ───────

/** Ce que Realtime met dans payload.new (date → 'YYYY-MM-DD', int8 → nombre). */
const EVENTS_AS_SUBSCRIBER = `
  select id::integer as id, player_id, kind, to_char(day, 'YYYY-MM-DD') as day,
         to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
  from public.events where id > $1 and id <= $2 order by id`

class PgChannel implements ChannelLike {
  /** Dernier événement déjà vu (Realtime ne rejoue pas ce qui précède l'abonnement). */
  lastId = Number.POSITIVE_INFINITY
  removed = false
  /** Lignes reçues par ce canal. */
  received: EventRow[] = []
  private handler: ((payload: { new: EventRow }) => void) | null = null
  readonly phone: Phone
  readonly name: string

  constructor(phone: Phone, name: string) {
    this.phone = phone
    this.name = name
  }

  on(type: 'postgres_changes', filter: EventsFilter, callback: (payload: { new: EventRow }) => void): ChannelLike {
    expect(type).toBe('postgres_changes')
    expect(filter).toEqual({ event: 'INSERT', schema: 'public', table: 'events' })
    this.handler = callback
    return this
  }

  subscribe(callback?: (status: ChannelStatus, err?: Error) => void): ChannelLike {
    void track(async () => {
      const last = await t.lastEventId()
      if (this.removed) return
      this.lastId = last
      realtime.channels.add(this)
      callback?.('SUBSCRIBED')
    })
    return this
  }

  deliver(row: EventRow) {
    if (this.removed) return
    this.received.push(row)
    this.handler?.({ new: row })
  }
}

class FakeRealtime {
  readonly channels = new Set<PgChannel>()
  pending = 0
  private queue: Promise<void> = Promise.resolve()

  /** Après une écriture : chaque canal branché reçoit les lignes que SA session peut lire. */
  pump(): Promise<void> {
    this.pending++
    this.queue = this.queue
      .then(() => this.deliver())
      .catch((e: unknown) => {
        throw new Error(`Faux Realtime en panne : ${String(e)}`)
      })
      .finally(() => {
        this.pending--
      })
    return this.queue
  }

  private async deliver() {
    const last = await t.lastEventId()
    for (const ch of [...this.channels]) {
      if (ch.removed || ch.lastId >= last) continue
      const from = ch.lastId
      ch.lastId = last
      const uid = ch.phone.uid
      if (!uid) continue
      // Comme Realtime : la policy de public.events décide, ligne par ligne, pour CETTE session.
      const res = await t.asRole<EventRow>(uid, EVENTS_AS_SUBSCRIBER, [from, last])
      expect(res.error).toBeNull()
      for (const row of res.data ?? []) ch.deliver(row)
    }
  }

  reset() {
    this.channels.clear()
  }
}

const realtime = new FakeRealtime()

// ─── Un téléphone : faux client Supabase + la vraie SupabaseSource ───────────

const phones: Phone[] = []

class Phone implements SupabaseLike {
  /** Session anonyme gardée par le téléphone (localStorage), null si aucune. */
  uid: string | null = null
  anonSignIns = 0
  calls: { fn: RpcName; args: object; error: string | null }[] = []
  /** Toasts reçus (Activity) depuis le dernier takeToasts(). */
  activities: Activity[] = []
  /** Tous les snapshots notifiés aux écrans (pour voir l'optimiste, puis l'annulation). */
  history: DuelSnapshot[] = []
  readonly label: string
  private source: SupabaseSource | null = null
  private channels: PgChannel[] = []
  private authCallbacks = new Set<(event: string, session: SessionLike | null) => void>()

  constructor(label: string) {
    this.label = label
    phones.push(this)
  }

  private session(): SessionLike | null {
    return this.uid ? { access_token: `jwt-${this.uid}`, user: { id: this.uid, is_anonymous: true } } : null
  }

  private emitAuth(event: string) {
    for (const cb of [...this.authCallbacks]) cb(event, this.session())
  }

  auth: SupabaseLike['auth'] = {
    getSession: async () => ({ data: { session: this.session() }, error: null }),
    signInAnonymously: async () => {
      this.anonSignIns++
      this.uid = await track(() => t.newUser())
      this.emitAuth('SIGNED_IN')
      return { data: { session: this.session() }, error: null }
    },
    signOut: async () => {
      this.uid = null
      this.emitAuth('SIGNED_OUT')
      return { error: null }
    },
    onAuthStateChange: (callback) => {
      this.authCallbacks.add(callback)
      // Comme supabase-js : un premier événement avec la session gardée.
      queueMicrotask(() => callback('INITIAL_SESSION', this.session()))
      return { data: { subscription: { unsubscribe: () => this.authCallbacks.delete(callback) } } }
    },
  }

  rpc(fn: RpcName, args: object = {}): PromiseLike<RpcResult> {
    return track(async () => {
      const res = await t.rpc(this.uid, fn, args as Record<string, unknown>)
      this.calls.push({ fn, args, error: res.error?.code ?? null })
      // L'écho temps réel arrive APRÈS la réponse, comme en vrai (websocket à part).
      void realtime.pump()
      return res
    })
  }

  channel(name: string): ChannelLike {
    const ch = new PgChannel(this, name)
    this.channels.push(ch)
    return ch
  }

  async removeChannel(channel: ChannelLike): Promise<unknown> {
    const ch = channel as PgChannel
    ch.removed = true
    realtime.channels.delete(ch)
    return 'ok'
  }

  /** Lance l'app (la session gardée est reprise). */
  open(): SupabaseSource {
    const src = new SupabaseSource({ client: this, clock })
    this.source = src
    src.subscribe((snap, activity) => {
      this.history.push(snap)
      if (activity) this.activities.push(activity)
    })
    return src
  }

  /** Ferme l'app (la session reste gardée sur le téléphone). */
  close() {
    this.source?.dispose()
    this.source = null
  }

  /** Ferme puis rouvre l'app (ex. le lendemain matin). */
  relaunch(): SupabaseSource {
    this.close()
    return this.open()
  }

  get src(): SupabaseSource {
    if (!this.source) throw new Error(`${this.label} : app fermée`)
    return this.source
  }

  get snap(): DuelSnapshot {
    return this.src.getSnapshot()
  }

  /** Les textes des toasts reçus depuis le dernier appel (puis oubliés). */
  takeToasts(): string[] {
    const out = this.activities.map((a) => a.text)
    this.activities = []
    return out
  }

  /** Événements reçus en temps réel par ce téléphone (tous canaux confondus). */
  received(): EventRow[] {
    return this.channels.flatMap((c) => c.received)
  }

  count(fn: RpcName): number {
    return this.calls.filter((c) => c.fn === fn).length
  }
}

// ─── Outils ──────────────────────────────────────────────────────────────────

/** Un téléphone qui ouvre l'app et se connecte (prénom + code). */
async function signedIn(label: string, player: PlayerId, code: string): Promise<Phone> {
  const phone = new Phone(label)
  phone.open()
  await settle()
  await phone.src.signIn(player, code)
  await settle()
  return phone
}

/** Les trois téléphones du duel, connectés. */
async function threePhones() {
  const a = await signedIn('Arthus 📱', A, CODE_A)
  const l = await signedIn('Laetitia 📱', L, CODE_L)
  const a2 = await signedIn('Arthus 📱 bis', A, CODE_A)
  a.takeToasts()
  l.takeToasts()
  a2.takeToasts()
  return { a, l, a2 }
}

function habitOf(s: DuelSnapshot, player: PlayerId, name: string): Habit {
  const h = s.habits.find((x) => x.playerId === player && x.name === name && x.activeUntil === null)
  if (!h) throw new Error(`Pas d'habitude ${name} pour ${player}`)
  return h
}

function activeHabits(s: DuelSnapshot, player: PlayerId, day: DayKey): Habit[] {
  return s.habits.filter((h) => h.playerId === player && h.activeFrom <= day && (h.activeUntil === null || day < h.activeUntil))
}

/** Remplit tout le check-in du jour du joueur connecté (une valeur par type). */
async function fillDay(phone: Phone, day: DayKey, values: { avoid: CheckinValue; do: CheckinValue }) {
  for (const h of activeHabits(phone.snap, phone.snap.meId, day)) await phone.src.setCheckin(day, h.id, values[h.kind])
}

function toast(kind: ActivityKind, name: string, opts: { paid?: boolean } = {}): string {
  return activityText(kind, name, opts)
}

function pendingOf(s: DuelSnapshot, author: PlayerId, kind: Proposal['payload']['kind']): Proposal[] {
  return s.proposals.filter((p) => p.authorId === author && p.status === 'pending' && p.payload.kind === kind)
}

async function eventKinds(afterId = 0): Promise<EventKind[]> {
  return (await t.eventsSince(afterId)).map((e) => e.kind)
}

/** Les kilos que l'autre ne doit pas voir : aucun weightKg / goalKg d'Arthus chez Laetitia. */
function kilosOfOther(s: DuelSnapshot): unknown[] {
  const other = s.players.find((p) => p.id !== s.meId)!.id
  return [
    s.players.find((p) => p.id === other)!.goalKg,
    ...s.weighIns.filter((w) => w.playerId === other).map((w) => w.weightKg),
    ...s.proposals.filter((p) => p.authorId === other && p.payload.kind === 'goal_weight').map((p) => (p.payload as { goalKg: number | null }).goalKg),
  ].filter((v) => v !== null && v !== undefined)
}

// ─── Cycle de vie ────────────────────────────────────────────────────────────

beforeAll(async () => {
  t = await createTestDb()
})

afterAll(async () => {
  await t?.close()
})

beforeEach(async () => {
  await t.reset()
  realtime.reset()
  // Dimanche avant la 1re manche (jour de pesée par défaut), 10 h à Paris.
  await setNow(addDays(SEASON_START, -1), 10)
})

afterEach(async () => {
  for (const p of phones.splice(0)) p.close()
  await settle()
})

// ─── Scénarios ───────────────────────────────────────────────────────────────

describe('connexion par prénom + code (décision 20)', () => {
  it('premier lancement : écran de connexion, on choisit son code, puis le 2e téléphone se connecte', async () => {
    const a = new Phone('Arthus 📱')
    const src = a.open()
    expect(src.loading).toBe(true)
    await settle()
    expect(src.loading).toBe(false)
    expect(src.signedIn).toBe(false)
    expect(src.problem).toBeNull()
    expect(a.uid).toBeNull() // pas de session tant qu'on n'a pas tapé de code

    // Personne n'a encore de code : « Choisis ton code ».
    expect(await src.loginPlayers()).toEqual(
      DEFAULT_PLAYERS.map((p) => ({ id: p.key, name: p.name, emoji: p.emoji, color: p.color, hasCode: false })),
    )
    await expect(src.signIn(A, '12a456')).rejects.toThrow(MESSAGES.codeFormat)
    expect(a.anonSignIns).toBe(0)

    await src.signIn(A, CODE_A)
    expect(src.signedIn).toBe(true)
    expect(a.anonSignIns).toBe(1)
    const s = src.getSnapshot()
    expect(s.meId).toBe(A)
    expect(s.players.map((p) => p.id)).toEqual(DEFAULT_PLAYERS.map((p) => p.key))
    expect(s.settings.seasonStart).toBe(SEASON_START)
    expect(s.settings.gages).toEqual(DEFAULT_GAGES)
    expect(s.habits.filter((h) => h.playerId === A).map((h) => h.name)).toEqual(
      DEFAULT_HABITS.filter((h) => h.owners.includes('arthus')).map((h) => h.name),
    )
    expect(s.habits.filter((h) => h.playerId === L)).toHaveLength(DEFAULT_HABITS.filter((h) => h.owners.includes('laetitia')).length)
    expect((await src.loginPlayers()).map((p) => [p.id, p.hasCode])).toEqual([
      [L, false],
      [A, true],
    ])
    await settle()
    // Avant la 1re manche : rien à tirer au sort.
    expect(a.count('ensure_stake')).toBe(0)

    // Laetitia choisit le sien sur son téléphone.
    const l = await signedIn('Laetitia 📱', L, CODE_L)
    expect(l.snap.meId).toBe(L)

    // Le 2e téléphone d'Arthus : mauvais code, puis le bon (la même session anonyme est reprise).
    const a2 = new Phone('Arthus 📱 bis')
    a2.open()
    await settle()
    await expect(a2.src.signIn(A, '000000')).rejects.toThrow('Code incorrect 🙅')
    expect(a2.src.signedIn).toBe(false)
    expect(a2.src.getSnapshot()).toEqual(initialSnapshot())
    await a2.src.signIn(A, CODE_A)
    expect(a2.src.signedIn).toBe(true)
    expect(a2.anonSignIns).toBe(1)
    expect(a2.snap.meId).toBe(A)
    expect(await t.sql(`select player_id from duel.devices order by player_id`)).toEqual([
      { player_id: A },
      { player_id: A },
      { player_id: L },
    ])

    // Relancer l'app : le téléphone s'en souvient, pas besoin de retaper le code.
    const again = l.relaunch()
    await settle()
    expect(again.signedIn).toBe(true)
    expect(again.getSnapshot().meId).toBe(L)
    expect(l.anonSignIns).toBe(1)
  })

  it('changement de code (les autres téléphones dehors), déconnexion d’un seul téléphone, code oublié (ligne SQL du README)', async () => {
    const { a, l, a2 } = await threePhones()

    await expect(a.src.changeCode('999999', '654321')).rejects.toThrow('Code incorrect 🙅')
    expect(a.src.signedIn).toBe(true)
    await expect(a.src.changeCode(CODE_A, '65432')).rejects.toThrow(MESSAGES.codeFormat)
    await a.src.changeCode(CODE_A, '654321')
    await settle()

    // Ce téléphone reste connecté, Laetitia aussi ; l'AUTRE téléphone d'Arthus est mis dehors
    // (SEC-4 : un intrus qui avait vu l'ancien code ne garde pas l'accès).
    expect(a.src.signedIn).toBe(true)
    expect(l.src.signedIn).toBe(true)
    await expect(a2.src.setCheckin(SEASON_START, habitOf(a2.snap, A, 'Ongles').id, 'nickel')).rejects.toThrow(MESSAGES.notMember)
    expect(a2.src.signedIn).toBe(false)
    expect(a2.src.getSnapshot()).toEqual(initialSnapshot())
    a2.relaunch()
    await settle()
    expect(a2.src.signedIn).toBe(false)
    expect(a2.src.problem).toBeNull()
    // Un nouveau téléphone doit taper le nouveau code.
    const a3 = new Phone('Arthus 📱 ter')
    a3.open()
    await settle()
    await expect(a3.src.signIn(A, CODE_A)).rejects.toThrow('Code incorrect 🙅')
    await a3.src.signIn(A, '654321')
    expect(a3.src.signedIn).toBe(true)

    // « Se déconnecter » sur le 📱 ter : lui seul oublie Arthus.
    const oldUid = a3.uid!
    await a3.src.signOut()
    await settle()
    expect(a3.src.signedIn).toBe(false)
    expect(a3.uid).toBeNull()
    expect(a3.src.getSnapshot()).toEqual(initialSnapshot())
    expect((await t.rpc(oldUid, 'get_snapshot', {})).error?.code).toBe('28000')
    const before = a3.received().length

    // Le 📱 d'Arthus continue de jouer, Laetitia le voit en direct, le 📱 ter ne reçoit plus rien.
    await setNow(SEASON_START, 20)
    await fillDay(a, SEASON_START, { avoid: 'nickel', do: 'fait' })
    await settle()
    expect(a.src.signedIn).toBe(true)
    expect(l.takeToasts()).toEqual([toast('checkin_done', 'Arthus')])
    expect(l.snap.checkins.filter((c) => c.playerId === A)).toHaveLength(3)
    expect(a3.received()).toHaveLength(before)

    // Code oublié : la ligne SQL du README pose un nouveau code et met TOUS ses téléphones dehors.
    await t.sql(`select duel.reset_code('arthus', '222222');`)
    a.relaunch()
    await settle()
    expect(a.src.signedIn).toBe(false)
    expect((await a.src.loginPlayers()).find((p) => p.id === A)?.hasCode).toBe(true)
    await expect(a.src.signIn(A, '654321')).rejects.toThrow('Code incorrect 🙅')
    await a.src.signIn(A, '222222')
    expect(a.src.signedIn).toBe(true)
    // Laetitia n'a rien vu passer.
    l.relaunch()
    await settle()
    expect(l.src.signedIn).toBe(true)
  })

  it('verrou : 10 codes faux en 15 min bloquent le prénom (même avec le bon code), Laetitia le lève depuis son téléphone', async () => {
    const l = await signedIn('Laetitia 📱', L, CODE_L)
    const thief = new Phone('📱 inconnu')
    thief.open()
    await settle()
    for (let i = 0; i < 10; i++) {
      await expect(thief.src.signIn(L, String(100000 + i))).rejects.toThrow('Code incorrect 🙅')
    }
    await expect(thief.src.signIn(L, CODE_L)).rejects.toThrow(`Trop de codes faux 🥵 Réessaie dans 15${NBSP}min ⏳`)
    expect(thief.src.signedIn).toBe(false)
    // Le prénom d'à côté n'est pas bloqué, et Laetitia reste connectée sur son téléphone.
    const a = new Phone('Arthus 📱')
    a.open()
    await settle()
    await a.src.signIn(A, CODE_A)
    expect(l.src.signedIn).toBe(true)

    await setNow(addDays(SEASON_START, -1), 10, 14)
    await expect(thief.src.signIn(L, CODE_L)).rejects.toThrow(`Trop de codes faux 🥵 Réessaie dans 1${NBSP}min ⏳`)
    // Son nouveau téléphone est bloqué aussi… jusqu'à ce qu'elle débloque depuis l'ancien (SEC-3).
    const l2 = new Phone('Laetitia 📱 bis')
    l2.open()
    await settle()
    await expect(l2.src.signIn(L, CODE_L)).rejects.toThrow(/^Trop de codes faux/)
    expect(await l.src.unlockCode()).toBe(10)
    await l2.src.signIn(L, CODE_L)
    expect(l2.src.signedIn).toBe(true)
    expect(await l.src.unlockCode()).toBe(0)

    // L'inconnu s'acharne : le prénom est rebloqué, mais Laetitia peut toujours changer son
    // code depuis un téléphone connecté (seules SES erreurs comptent là).
    for (let i = 0; i < 10; i++) await thief.src.signIn(L, String(200000 + i)).catch(() => {})
    await expect(thief.src.signIn(L, CODE_L)).rejects.toThrow(/^Trop de codes faux/)
    await l.src.changeCode(CODE_L, '222222')
    await settle()
    expect(l.src.signedIn).toBe(true)
    // Changer de code lève le verrou (c'est bien elle) et déconnecte ses autres téléphones.
    await expect(thief.src.signIn(L, CODE_L)).rejects.toThrow('Code incorrect 🙅')
    l2.relaunch()
    await settle()
    expect(l2.src.signedIn).toBe(false)
    expect(thief.src.signedIn).toBe(false)
  })
})

describe('le duel en direct entre les téléphones', () => {
  it('check-ins des deux côtés : toast « 👀 » seulement chez l’autre, jour complet', async () => {
    const { a, l, a2 } = await threePhones()
    await setNow(SEASON_START, 20)
    for (const p of [a, l, a2]) p.relaunch()
    await settle()
    for (const p of [a, l, a2]) p.takeToasts()
    const day = SEASON_START
    const first = await t.lastEventId()

    // Optimiste : l'écran d'Arthus voit son check-in AVANT la réponse du serveur.
    const [ongles, grignotage, sport] = activeHabits(a.snap, A, day)
    const pending = a.src.setCheckin(day, ongles.id, 'nickel')
    expect(a.snap.checkins).toContainEqual(expect.objectContaining({ playerId: A, habitId: ongles.id, day, value: 'nickel' }))
    await pending
    await settle()
    // Check-in à moitié rempli : Laetitia le voit (le Ring bouge) mais pas de toast.
    expect(l.snap.checkins).toContainEqual(expect.objectContaining({ playerId: A, habitId: ongles.id, value: 'nickel' }))
    expect(l.takeToasts()).toEqual([])

    await a.src.setCheckin(day, grignotage.id, 'unpeu')
    await a.src.setCheckin(day, sport.id, 'fait')
    await settle()
    expect(await eventKinds(first)).toEqual(['checkin', 'checkin', 'checkin_done'])
    // Jour complet : toast chez Laetitia, rien chez Arthus (ni sur son 2e téléphone)…
    expect(l.takeToasts()).toEqual([toast('checkin_done', 'Arthus')])
    expect(a.takeToasts()).toEqual([])
    expect(a2.takeToasts()).toEqual([])
    // … dont le 2e téléphone montre pourtant le même check-in, comme le serveur.
    expect(a2.snap.checkins).toEqual(a.snap.checkins)
    expect(l.snap.checkins).toEqual(a.snap.checkins)
    for (const p of [a, l, a2]) {
      const season = buildSeason(p.snap, day)
      expect(season.current.scores[A].days[0]).toMatchObject({ complete: true, score: 83 })
      expect(season.current.scores[L].days[0]).toMatchObject({ complete: false, score: 0 })
    }

    // Laetitia fait le sien : les DEUX téléphones d'Arthus ont le toast, pas elle.
    await fillDay(l, day, { avoid: 'nickel', do: 'fait' })
    await settle()
    expect(a.takeToasts()).toEqual([toast('checkin_done', 'Laetitia')])
    expect(a2.takeToasts()).toEqual([toast('checkin_done', 'Laetitia')])
    expect(l.takeToasts()).toEqual([])

    // Retoucher un jour déjà complet : pas de nouveau toast.
    await l.src.setCheckin(day, habitOf(l.snap, L, 'Sport').id, 'pasfait')
    await settle()
    expect(a.takeToasts()).toEqual([])
    expect(a.snap.checkins.find((c) => c.playerId === L && c.habitId === habitOf(l.snap, L, 'Sport').id)?.value).toBe('pasfait')

    // Le lendemain, on peut encore rattraper « hier »… et effacer une réponse.
    await setNow(addDays(day, 1), 9)
    await a.src.setCheckin(day, grignotage.id, 'nickel')
    await a.src.setCheckin(day, sport.id, null)
    await settle()
    expect(l.snap.checkins.filter((c) => c.playerId === A && c.day === day).map((c) => c.value).sort()).toEqual(['nickel', 'nickel'])
    expect(a.snap.checkins).toEqual(l.snap.checkins)
  })

  it('pesée : kilos de l’autre masqués, ses % arrondis mais mêmes points sur tous les téléphones, avec et sans « montrer mes kilos »', async () => {
    const { a, l, a2 } = await threePhones()
    const start = addDays(SEASON_START, -1) // dimanche : pesée de départ
    const next = addDays(SEASON_START, 6) // dimanche de la 1re manche

    await a.src.saveWeighIn(start, 90)
    await l.src.saveWeighIn(start, 70)
    await settle()
    expect(l.takeToasts()).toEqual([toast('weighin', 'Arthus')])
    expect(a.takeToasts()).toEqual([toast('weighin', 'Laetitia')])
    expect(a2.takeToasts()).toEqual([toast('weighin', 'Laetitia')])

    await setNow(next, 8)
    // Optimiste : mes % sont calculés tout de suite… et ce sont exactement ceux du serveur.
    const saving = a.src.saveWeighIn(next, 89.06)
    const optimistic = a.snap.weighIns
    await saving
    await settle()
    expect(a.snap.weighIns).toEqual(optimistic)
    await l.src.saveWeighIn(next, 69.3)
    await settle()

    const mine = a.snap.weighIns.filter((w) => w.playerId === A)
    expect(mine).toEqual([
      { playerId: A, day: start, weightKg: 90, changePct: null, fromStartPct: 0, goalDistancePct: null },
      { playerId: A, day: next, weightKg: 89.1, changePct: percentChange(90, 89.1), fromStartPct: percentChange(90, 89.1), goalDistancePct: null },
    ])
    // Chez Laetitia : pas de kilos, et des % arrondis (des % exacts redonneraient les kilos, SEC-1).
    const seenByL = l.snap.weighIns.filter((w) => w.playerId === A)
    expect(seenByL).toEqual(mine.map((w) => maskWeighIn(w)))
    expect(seenByL.map((w) => [w.changePct, w.fromStartPct])).toEqual([
      [null, 0],
      [-1, -1],
    ])
    expect(kilosOfOther(l.snap)).toEqual([])
    expect(kilosOfOther(a.snap)).toEqual([])
    expect(a2.snap.weighIns).toEqual(a.snap.weighIns)
    // Ses propres kilos, elle les voit, et ses % exacts.
    expect(l.snap.weighIns.filter((w) => w.playerId === L).map((w) => [w.weightKg, w.changePct])).toEqual([
      [70, null],
      [69.3, percentChange(70, 69.3)],
    ])
    // … et chez Arthus, ceux de Laetitia sont arrondis à leur tour.
    expect(a.snap.weighIns.filter((w) => w.playerId === L)).toEqual(l.snap.weighIns.filter((w) => w.playerId === L).map((w) => maskWeighIn(w)))
    // Les points de pesée sont les mêmes partout (−1 % = 100 pts), pour les deux joueurs.
    const pointsA = buildSeason(a.snap, next).current.scores[A].weighInPoints
    expect(pointsA).toBe(100)
    for (const p of [a, l, a2]) {
      expect(buildSeason(p.snap, next).current.scores[A].weighInPoints).toBe(pointsA)
      expect(buildSeason(p.snap, next).current.scores[L].weighInPoints).toBe(buildSeason(l.snap, next).current.scores[L].weighInPoints)
    }

    // Une perte partielle (entre 0 et −1 %) : mêmes points des deux côtés, au centième près.
    await setNow(addDays(next, 7), 8)
    await a.src.saveWeighIn(addDays(next, 7), 88.7)
    await settle()
    const partial = a.snap.weighIns.find((w) => w.playerId === A && w.day === addDays(next, 7))!
    const partialSeenByL = l.snap.weighIns.find((w) => w.playerId === A && w.day === addDays(next, 7))!
    expect(weighInPoints(partial)).toBe(45)
    expect(partialSeenByL).toMatchObject({ weightKg: null, changePct: -0.45, fromStartPct: -1.4 })
    expect(weighInPoints(partialSeenByL)).toBe(45)
    expect(isInGoalZone(partialSeenByL.goalDistancePct)).toBe(isInGoalZone(partial.goalDistancePct))

    // « Montrer mes kilos » : Laetitia les voit en direct, avec un toast.
    l.takeToasts()
    await a.src.updateProfile({ showKg: true })
    await settle()
    expect(l.takeToasts()).toEqual([toast('profile', 'Arthus')])
    expect(l.snap.weighIns.filter((w) => w.playerId === A).map((w) => w.weightKg)).toEqual([90, 89.1, 88.7])
    // … et ses % exacts.
    expect(l.snap.weighIns.filter((w) => w.playerId === A)).toEqual(a.snap.weighIns.filter((w) => w.playerId === A))
    expect(l.snap.players.find((p) => p.id === A)?.showKg).toBe(true)
    await a.src.updateProfile({ showKg: false })
    await settle()
    expect(kilosOfOther(l.snap)).toEqual([])
  })

  it('propositions : réponse de l’autre, objectif de poids jamais en kg chez l’autre, effets le lundi suivant', async () => {
    const { a, l, a2 } = await threePhones()
    const start = addDays(SEASON_START, -1)
    await a.src.saveWeighIn(start, 90)
    await l.src.saveWeighIn(start, 70)
    const wednesday = addDays(SEASON_START, 2)
    const nextMonday = addDays(SEASON_START, 7)
    await setNow(wednesday, 12)
    for (const p of [a, l, a2]) p.relaunch()
    await settle()
    for (const p of [a, l, a2]) p.takeToasts()

    // Arthus propose un objectif : ses kilos restent chez lui, Laetitia ne voit que le %.
    await a.src.propose({ kind: 'goal_weight', clear: false, goalKg: 85, goalFromStartPct: null })
    await settle()
    // Le % est au demi-% (un % exact redonnerait les kilos, SEC-1), le même pour les deux.
    const pct = pctHalf(percentChange(90, 85))
    expect(pct).toBe(-5.5)
    const [goalA] = pendingOf(a.snap, A, 'goal_weight')
    expect(goalA.payload).toEqual({ kind: 'goal_weight', clear: false, goalKg: 85, goalFromStartPct: pct })
    expect(pendingOf(a2.snap, A, 'goal_weight')[0].payload).toEqual(goalA.payload)
    const [goalSeenByL] = pendingOf(l.snap, A, 'goal_weight')
    expect(goalSeenByL.payload).toEqual({ kind: 'goal_weight', clear: false, goalKg: null, goalFromStartPct: pct })
    expect(kilosOfOther(l.snap)).toEqual([])
    expect(l.takeToasts()).toEqual([toast('proposal', 'Arthus')])
    expect(a.takeToasts()).toEqual([])

    // Reproposer sur le même sujet remplace l'ancienne (décision 17).
    await a.src.propose({ kind: 'goal_weight', clear: false, goalKg: 84.5, goalFromStartPct: null })
    await settle()
    expect(pendingOf(l.snap, A, 'goal_weight')).toHaveLength(1)
    expect(l.snap.proposals.find((p) => p.id === goalA.id)?.status).toBe('cancelled')
    const goal = pendingOf(a.snap, A, 'goal_weight')[0]
    expect((goal.payload as { goalKg: number | null }).goalKg).toBe(84.5)
    l.takeToasts()

    // Laetitia propose une habitude et un jour de pesée.
    await l.src.propose({ kind: 'habit_add', name: 'Eau', emoji: '💧', hint: '1,5 L par jour', habitKind: 'do' })
    await l.src.propose({ kind: 'weigh_day', isoDay: 6 })
    await settle()
    expect(a.takeToasts()).toEqual([toast('proposal', 'Laetitia')])
    expect(a2.takeToasts()).toEqual([toast('proposal', 'Laetitia')])
    expect(l.takeToasts()).toEqual([])
    const [eau] = pendingOf(a.snap, L, 'habit_add')
    const [samedi] = pendingOf(a.snap, L, 'weigh_day')

    // Arthus accepte l'une, refuse l'autre : Laetitia est prévenue à chaque fois.
    await a.src.answerProposal(eau.id, true)
    await settle()
    expect(l.takeToasts()).toEqual([toast('proposal_accepted', 'Arthus')])
    await a.src.answerProposal(samedi.id, false)
    await settle()
    expect(l.takeToasts()).toEqual([toast('proposal_refused', 'Arthus')])
    expect(a2.takeToasts()).toEqual([])
    const accepted = l.snap.proposals.find((p) => p.id === eau.id)!
    expect(accepted).toMatchObject({ status: 'accepted', effectiveFrom: nextMonday })
    expect(l.snap.proposals.find((p) => p.id === samedi.id)).toMatchObject({ status: 'refused', effectiveFrom: null })
    const water = habitOf(l.snap, L, 'Eau')
    expect(water).toMatchObject({ kind: 'do', hint: '1,5 L par jour', emoji: '💧', badgeKey: null, activeFrom: nextMonday })

    // Seul l'autre répond ; une proposition réglée ne se rejoue pas.
    await expect(l.src.answerProposal(eau.id, true)).rejects.toThrow('C’est à l’autre de répondre 😉')
    await expect(a.src.answerProposal(eau.id, false)).rejects.toThrow('Cette proposition est déjà réglée 🤷')

    // Laetitia accepte l'objectif d'Arthus.
    await l.src.answerProposal(goal.id, true)
    await settle()
    expect(a.takeToasts()).toEqual([toast('proposal_accepted', 'Laetitia')])
    expect(a2.takeToasts()).toEqual([toast('proposal_accepted', 'Laetitia')])
    // Effet le lundi suivant : cette semaine, pas encore d'objectif.
    expect(a.snap.players.find((p) => p.id === A)?.goalKg).toBeNull()

    // Une proposition annulée : Laetitia relit sans toast trompeur.
    await a.src.propose({ kind: 'habit_disable', habitId: habitOf(a.snap, A, 'Sport').id })
    await settle()
    expect(l.takeToasts()).toEqual([toast('proposal', 'Arthus')])
    const [disable] = pendingOf(a.snap, A, 'habit_disable')
    await expect(l.src.cancelProposal(disable.id)).rejects.toThrow('Seul l’auteur peut annuler sa proposition 😉')
    await a.src.cancelProposal(disable.id)
    await settle()
    expect(l.snap.proposals.find((p) => p.id === disable.id)?.status).toBe('cancelled')
    expect(l.takeToasts()).toEqual([])

    // Dimanche : l'habitude acceptée ne compte pas encore.
    await setNow(addDays(SEASON_START, 6), 21)
    const before = l.snap.checkins
    await expect(l.src.setCheckin(addDays(SEASON_START, 6), water.id, 'fait')).rejects.toThrow('Cette habitude ne compte pas ce jour-là 📅')
    expect(l.snap.checkins).toEqual(before)

    // Lundi suivant : on rouvre l'app, les effets sont là.
    await setNow(nextMonday, 8)
    for (const p of [a, l, a2]) p.relaunch()
    await settle()
    const meA = a.snap.players.find((p) => p.id === A)!
    expect(meA).toMatchObject({ goalKg: 84.5, goalFromStartPct: percentChange(90, 84.5) })
    expect(l.snap.players.find((p) => p.id === A)).toMatchObject({ goalKg: null, goalFromStartPct: pctHalf(meA.goalFromStartPct!) })
    expect(kilosOfOther(l.snap)).toEqual([])
    expect(activeHabits(l.snap, L, nextMonday).map((h) => h.name)).toContain('Eau')
    await l.src.setCheckin(nextMonday, water.id, 'fait')
    await settle()
    expect(a.snap.checkins).toContainEqual(expect.objectContaining({ playerId: L, habitId: water.id, day: nextMonday, value: 'fait' }))
    // Le jour de pesée n'a pas changé (proposition refusée).
    expect(a.snap.settings.weighInDays).toEqual([])
  })

  it('enjeu : tiré une seule fois au lundi, le même sur tous les téléphones, sans toast', async () => {
    const { a, l, a2 } = await threePhones()
    const monday = SEASON_START
    const first = await t.lastEventId()

    // Lundi matin, les trois téléphones s'ouvrent en même temps.
    await setNow(monday, 7)
    for (const p of [a, l, a2]) p.relaunch()
    await settle()
    const expected = drawStake(DEFAULT_GAGES, monday, null)
    for (const p of [a, l, a2]) {
      expect(p.snap.weeks.find((w) => w.weekStart === monday)?.stake).toBe(expected)
      expect(p.takeToasts()).toEqual([])
    }
    expect(await eventKinds(first)).toEqual(['stake'])
    expect(a.count('ensure_stake') + l.count('ensure_stake') + a2.count('ensure_stake')).toBeGreaterThanOrEqual(2)

    // L'enjeu se change le lundi (toast chez l'autre), puis il est verrouillé.
    await l.src.setStake(monday, '  Massage des pieds 🦶  ')
    await settle()
    expect(a.takeToasts()).toEqual([toast('stake', 'Laetitia')])
    expect(a2.takeToasts()).toEqual([toast('stake', 'Laetitia')])
    expect(l.takeToasts()).toEqual([])
    expect(a.snap.weeks.find((w) => w.weekStart === monday)?.stake).toBe('Massage des pieds 🦶')
    await setNow(addDays(monday, 1), 8)
    await expect(a.src.setStake(monday, 'Autre chose')).rejects.toThrow('L’enjeu est verrouillé 🔒')

    // La liste des gages change : relecture chez l'autre, sans toast trompeur.
    const gages = ['Gage A 🅰️', 'Gage B 🅱️', '  ', 'Gage C ©️']
    await a.src.setGages(gages)
    await settle()
    expect(l.snap.settings.gages).toEqual(['Gage A 🅰️', 'Gage B 🅱️', 'Gage C ©️'])
    expect(a2.snap.settings.gages).toEqual(l.snap.settings.gages)
    for (const p of [a, l, a2]) expect(p.takeToasts()).toEqual([])

    // Lundi suivant : nouveau tirage dans la nouvelle liste, jamais deux fois le même d'affilée.
    const monday2 = addDays(monday, 7)
    await setNow(monday2, 6)
    for (const p of [a, l, a2]) p.relaunch()
    await settle()
    const expected2 = drawStake(l.snap.settings.gages, monday2, 'Massage des pieds 🦶')
    for (const p of [a, l, a2]) {
      expect(p.snap.weeks.find((w) => w.weekStart === monday2)?.stake).toBe(expected2)
      expect(p.takeToasts()).toEqual([])
    }
    expect((await eventKinds(first)).filter((k) => k === 'stake')).toHaveLength(3)
  })

  it('une manche complète : résultats, cérémonie vue, gage payé, badges gravés', async () => {
    const { a, l, a2 } = await threePhones()
    const week = daysRange(SEASON_START, addDays(SEASON_START, 6))
    for (const day of week) {
      await setNow(day, 21)
      await fillDay(a, day, { avoid: 'nickel', do: 'fait' })
      await fillDay(l, day, { avoid: 'unpeu', do: day < week[3] ? 'fait' : 'pasfait' })
    }
    const monday = addDays(SEASON_START, 7)
    await setNow(monday, 9)
    for (const p of [a, l, a2]) p.relaunch()
    await settle()

    // Résultats : Arthus gagne sur les trois téléphones.
    for (const p of [a, l, a2]) {
      const season = buildSeason(p.snap, monday)
      expect(season.finished).toHaveLength(1)
      expect(season.finished[0].outcome).toMatchObject({ winnerId: A, gageFor: [L] })
      expect(season.finished[0].scores[A].daysTotal).toBe(700)
    }
    // Le dimanche est clos (décision 1).
    await expect(l.src.setCheckin(week[6], habitOf(l.snap, L, 'Sport').id, 'fait')).rejects.toThrow('Ce jour n’est plus modifiable 🔒')

    // Cérémonie : vue par Arthus (sur un téléphone = sur les deux), pas par Laetitia.
    const seasonA = buildSeason(a.snap, monday)
    expect(pendingResultsWeek(seasonA, a.snap.seenResults)?.weekStart).toBe(SEASON_START)
    await a.src.markResultsSeen(SEASON_START)
    await settle()
    a2.relaunch()
    await settle()
    expect(a2.snap.seenResults).toEqual([SEASON_START])
    expect(pendingResultsWeek(buildSeason(a2.snap, monday), a2.snap.seenResults)).toBeNull()
    expect(l.snap.seenResults).toEqual([])
    for (const p of [a, l, a2]) p.takeToasts()

    // Gage payé ✅ : c'est Arthus (le gagnant) qui valide celui de Laetitia.
    await expect(l.src.setGagePaid(SEASON_START, L, true)).rejects.toThrow(MESSAGES.notYourGage)
    await a.src.setGagePaid(SEASON_START, L, true)
    await settle()
    expect(l.takeToasts()).toEqual([toast('gage_paid', 'Arthus', { paid: true })])
    expect(l.snap.weeks.find((w) => w.weekStart === SEASON_START)?.gagePaid).toEqual({ [L]: true })
    await a2.src.setGagePaid(SEASON_START, L, false)
    await settle()
    expect(l.takeToasts()).toEqual([toast('gage_paid', 'Arthus', { paid: false })])
    expect(a.snap.weeks.find((w) => w.weekStart === SEASON_START)?.gagePaid).toEqual({ [L]: false })

    // Badges : ce que DuelProvider enregistre, gravé une seule fois, visible des deux côtés.
    const record = async (p: Phone) => {
      const season = buildSeason(p.snap, monday)
      const todo = badgeUnlocksToRecord(p.snap.meId, computeBadges(p.snap.meId, p.snap, season, monday), p.snap.badgeUnlocks)
      if (todo.length > 0) await p.src.recordBadgeUnlocks(todo)
      return todo
    }
    const firstEvent = await t.lastEventId()
    const todo = await record(a)
    expect(todo.map((u) => u.badgeId).sort()).toEqual(['assidu', 'frigo', 'machine', 'manucure'])
    await settle()
    expect(await record(a2)).toEqual([]) // le 2e téléphone voit qu'ils sont déjà gravés
    expect(await eventKinds(firstEvent)).toEqual(['badge'])
    expect(l.snap.badgeUnlocks).toEqual(a.snap.badgeUnlocks)
    expect(l.snap.badgeUnlocks.map((u) => [u.playerId, u.badgeId, u.tier, u.day])).toContainEqual([A, 'manucure', null, week[6]])
    expect(l.takeToasts()).toEqual([])
    // Laetitia : des « un peu » partout, mais un check-in complet 7 jours d'affilée → 📅 seulement.
    expect((await record(l)).map((u) => u.badgeId)).toEqual(['assidu'])
    await settle()
    expect(a.snap.badgeUnlocks.filter((u) => u.playerId === L).map((u) => u.badgeId)).toEqual(['assidu'])
    expect(a.takeToasts()).toEqual([])

    // Célébrations vues : par joueur, pas par téléphone.
    await a.src.markBadgesSeen(['manucure', 'assidu'])
    a2.relaunch()
    await settle()
    expect(a2.snap.seenBadges).toEqual(['manucure', 'assidu'])
    expect(l.snap.seenBadges).toEqual([])
  })
})

describe('erreurs : message en français et annulation de l’optimiste', () => {
  it('règle refusée par le serveur : l’effet optimiste apparaît puis disparaît, message prêt à afficher', async () => {
    const { a, l } = await threePhones()
    const monday = addDays(SEASON_START, 7)
    await setNow(monday, 9)
    for (const p of [a, l]) p.relaunch()
    await settle()

    // Rattraper le dimanche le lundi : refusé (manche close).
    const sunday = addDays(SEASON_START, 6)
    const ongles = habitOf(a.snap, A, 'Ongles')
    a.history = []
    await expect(a.src.setCheckin(sunday, ongles.id, 'nickel')).rejects.toThrow('Ce jour n’est plus modifiable 🔒')
    const seen = a.history.map((s) => s.checkins.some((c) => c.habitId === ongles.id && c.day === sunday))
    expect(seen[0]).toBe(true) // optimiste
    expect(seen.at(-1)).toBe(false) // annulé
    expect(a.snap.checkins.some((c) => c.day === sunday)).toBe(false)

    // Se peser un lundi : refusé, pesées inchangées.
    const weighIns = a.snap.weighIns
    await expect(a.src.saveWeighIn(monday, 88)).rejects.toThrow('Ce n’est pas le jour de la pesée ⚖️')
    expect(a.snap.weighIns).toEqual(weighIns)

    // Prénom vide : refusé, l'ancien revient.
    await expect(a.src.updateProfile({ name: '   ' })).rejects.toThrow(`Prénom entre 1 et 24${NBSP}caractères ✏️`)
    expect(a.snap.players.find((p) => p.id === A)?.name).toBe('Arthus')

    // Prénom changé : Laetitia voit le nouveau prénom… dans le toast aussi.
    await a.src.updateProfile({ name: '  Tutus  ', emoji: '🦁' })
    await settle()
    expect(l.snap.players.find((p) => p.id === A)).toMatchObject({ name: 'Tutus', emoji: '🦁' })
    expect(l.takeToasts()).toEqual([toast('profile', 'Tutus')])
    await a.src.updateHabitLook(ongles.id, { name: ' Ongles nickel ', emoji: '💎' })
    await settle()
    expect(habitOf(l.snap, A, 'Ongles nickel').emoji).toBe('💎')

    // Rien de tout ça n'a laissé de trace chez Laetitia.
    expect(l.snap.checkins.some((c) => c.day === sunday)).toBe(false)
    await settle()
    expect(l.src.problem).toBeNull()
    expect(a.src.problem).toBeNull()
  })

  it('téléphone délié côté serveur : retour à l’écran de connexion, message « Connecte-toi d’abord »', async () => {
    const { a, l } = await threePhones()
    await setNow(SEASON_START, 12)
    // Ex. ménage manuel dans Supabase : ce téléphone n'est plus lié.
    await t.sql(`delete from duel.devices where user_id = $1`, [a.uid])
    const ongles = habitOf(a.snap, A, 'Ongles')
    await expect(a.src.setCheckin(SEASON_START, ongles.id, 'nickel')).rejects.toThrow(MESSAGES.notMember)
    expect(a.src.signedIn).toBe(false)
    expect(a.src.getSnapshot()).toEqual(initialSnapshot())
    // Il ne reçoit plus rien en temps réel (RLS), même si son canal était encore ouvert.
    await l.src.setCheckin(SEASON_START, habitOf(l.snap, L, 'Grattage').id, 'nickel')
    await settle()
    expect(a.received().filter((e) => e.player_id === L)).toEqual([])
    // Il se reconnecte avec son code, sur la même session.
    await a.src.signIn(A, CODE_A)
    expect(a.src.signedIn).toBe(true)
    expect(a.anonSignIns).toBe(1)

    // Session perdue sur le téléphone (stockage effacé) : supabase-js envoie la clé publishable
    // seule (rôle anon), PostgREST répond 42501 → retour à l'écran de connexion, en français.
    a.uid = null
    await expect(a.src.updateProfile({ emoji: '🐼' })).rejects.toThrow(MESSAGES.notMember)
    expect(a.calls.filter((c) => c.fn === 'update_profile').at(-1)?.error).toBe('42501')
    expect(a.src.signedIn).toBe(false)
    expect(l.snap.players.find((p) => p.id === A)?.emoji).toBe('🐻')
    await a.src.signIn(A, CODE_A)
    expect(a.src.signedIn).toBe(true)
    expect(a.anonSignIns).toBe(2)
  })
})
