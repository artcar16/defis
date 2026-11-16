/**
 * 🔁 Le VRAI chemin de mise à jour de la base d'Arthus (lundi 16 novembre 2026, précision 22) :
 * Grignotage passe en « tout ou rien » pour les deux, dès aujourd'hui.
 *
 * 1. La base telle qu'Arthus l'a créée : l'ANCIENNE migration (copie figée du commit cbe8a76,
 *    ./fixtures/0001_duel.cbe8a76.sql), date de début passée au lundi 16 par SQL, deux
 *    téléphones liés, et ce soir un « un peu » sur le Grignotage d'Arthus et un « nickel » sur
 *    ses Ongles.
 *    La nouvelle app est déployée et rouverte AVANT tout SQL (étape 0 du README) : elle marche
 *    sur cette base, puis suit le passage en tout ou rien sans recharger. (L'ancienne app,
 *    elle, ne saurait plus remplir Grignotage après l'activation : d'où cet ordre.)
 * 2. Le script d'activation lancé trop tôt : il s'arrête (message clair) sans rien changer.
 * 3. Arthus relance supabase/migrations/0001_duel.sql EN ENTIER : aucune donnée ne bouge.
 * 4. Il lance supabase/grignotage-tout-ou-rien.sql : Grignotage tout ou rien pour les deux, le
 *    reste intact, le « un peu » de ce soir garde ses 5 pts, les téléphones ouverts relisent
 *    sans notification.
 * 5. Tout relancer une 2e fois ne change plus rien.
 */
import { TZDate } from '@date-fns/tz'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import activationSql from '../../../supabase/grignotage-tout-ou-rien.sql?raw'
import resetSql from '../../../supabase/remise-a-zero.sql?raw'
import { valuesFor } from '../../core/scoring'
import { buildSeason } from '../../core/season'
import type { CheckinValue, DayKey, DuelSnapshot, PlayerId } from '../../core/types'
import type { Activity } from '../source'
import type { EventRow, RpcName } from './api'
import oldMigrationSql from './fixtures/0001_duel.cbe8a76.sql?raw'
import { createTestDb, MIGRATION_SQL, type RpcResult, type TestDb } from './pglite'
import { SupabaseSource, type ChannelLike, type SupabaseLike } from './SupabaseSource'

// PGlite démarre en ~3 s, et chaque test construit sa base à partir de l'ancienne migration.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

/** Le script d'activation, tel qu'on le colle dans le SQL Editor. */
const ACTIVATION_SQL: string = activationSql
const OLD_MIGRATION_SQL: string = oldMigrationSql

const A: PlayerId = 'arthus'
const L: PlayerId = 'laetitia'
const CODE_A = '482916'
const CODE_L = '135790'
const NBSP = ' '
const TODAY: DayKey = '2026-11-16'

const DONE = `✅ Grignotage${NBSP}: Nickel ou Craquage, pour Laetitia et Arthus`
const TOO_EARLY =
  'Relance d’abord supabase/migrations/0001_duel.sql en entier (SQL Editor › New query › tout coller › Run), puis ce script. Rien n’a été changé.'
const NO_UNPEU = `Pas de «${NBSP}un peu${NBSP}» pour Grignotage${NBSP}: c’est Nickel ou Craquage 😉`

let t: TestDb
let nowMs = Date.now()
const clock = () => new Date(nowMs)

/** Fige l'horloge du serveur (et du téléphone) à une heure de Paris. */
async function at(day: DayKey, hour: number, minute = 0) {
  const [y, m, d] = day.split('-').map(Number)
  nowMs = new TZDate(y, m - 1, d, hour, minute, 0, 0, 'Europe/Paris').getTime()
  await t.setNow(new Date(nowMs))
}

/**
 * Arthus relance supabase/migrations/0001_duel.sql en entier. Le script remet l'horloge du
 * serveur à l'heure réelle (duel.now) : on la refige à l'heure du test.
 */
async function migrate() {
  await t.db.exec(MIGRATION_SQL)
  await t.setNow(new Date(nowMs))
}

function ok<T>(res: RpcResult<T>): T {
  expect(res.error).toBeNull()
  return res.data as T
}

async function login(player: PlayerId, code: string): Promise<string> {
  const uid = await t.newUser()
  ok(await t.rpc(uid, 'claim_player', { p_player: player, p_code: code }))
  return uid
}

async function snap(uid: string): Promise<DuelSnapshot> {
  return ok(await t.rpc(uid, 'get_snapshot', {}))
}

function habitId(s: DuelSnapshot, player: PlayerId, badgeKey: string): string {
  const h = s.habits.find((x) => x.playerId === player && x.badgeKey === badgeKey && x.activeUntil === null)
  if (!h) throw new Error(`habitude ${player}/${badgeKey} introuvable`)
  return h.id
}

function setCheckin(uid: string, habit: string, value: CheckinValue | null, day: DayKey = TODAY) {
  return t.rpc(uid, 'set_checkin', { p_day: day, p_habit: habit, p_value: value })
}

/** Lance un script comme le SQL Editor (tout le fichier d'un coup) : la ligne « Résultat ». */
async function run(sql: string): Promise<string> {
  const results = await t.db.exec(sql)
  const rows = results.at(-1)?.rows as { Résultat: string }[] | undefined
  expect(rows).toHaveLength(1)
  return rows![0].Résultat
}

/** Le script refusé : l'erreur telle que l'affiche le SQL Editor. */
async function runError(sql: string): Promise<{ code: string; message: string }> {
  try {
    await t.db.exec(sql)
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return { code: err.code ?? '', message: err.message ?? String(e) }
  }
  throw new Error('Le script aurait dû être refusé')
}

/** Tout le contenu des tables du duel et du journal, lignes triées. */
type Dump = Record<string, Record<string, unknown>[]>
async function dump(): Promise<Dump> {
  const tables = await t.sql<{ name: string }>(`select 'duel.' || tablename as name from pg_tables where schemaname = 'duel' order by 1`)
  const out: Dump = {}
  for (const name of [...tables.map((x) => x.name), 'public.events']) {
    const rows = await t.sql<{ rows: Record<string, unknown>[] }>(
      `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb) as rows from ${name} x`,
    )
    out[name] = rows[0].rows
  }
  return out
}

/** Les Grignotage (id, joueur, type), et la contrainte des types d'habitude. */
async function grignotages() {
  return t.sql<{ id: string; player_id: string; kind: string }>(
    `select id::text, player_id, kind from duel.habits where badge_key = 'grignotage' order by player_id`,
  )
}
async function kindConstraint(): Promise<string[]> {
  const rows = await t.sql<{ def: string }>(
    `select pg_get_constraintdef(oid) as def from pg_constraint
     where conrelid = 'duel.habits'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'`,
  )
  return rows.map((r) => r.def)
}

/** Tout ce qui décide de qui peut appeler ou lire quoi. */
async function catalog() {
  return {
    functions: await t.sql(
      `select n.nspname || '.' || p.oid::regprocedure::text as sig, coalesce(p.proacl::text, '') as acl, p.prosecdef as definer
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname not in ('pg_catalog', 'information_schema') order by 1`,
    ),
    relations: await t.sql(
      `select c.oid::regclass::text as name, coalesce(c.relacl::text, '') as acl, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') order by 1`,
    ),
    policies: await t.sql(`select schemaname::text, tablename::text, policyname::text, roles::text, cmd, qual from pg_policies order by 1, 2, 3`),
  }
}

// ─── La base d'Arthus, ce lundi soir ───────────────────────────────────────

interface ArthusBase {
  arthus: string
  laetitia: string
  /** Les identifiants des habitudes de départ. */
  ids: Record<'ongles' | 'grignotageA' | 'sportA' | 'grattage' | 'grignotageL' | 'sportL', string>
}

/**
 * L'ANCIENNE migration, la date de début passée au lundi 16 (les deux lignes de l'en-tête
 * du script), les deux téléphones liés, l'enjeu tiré, et à 21:30 le check-in d'Arthus : un
 * « un peu » sur Grignotage, un « nickel » sur Ongles.
 */
async function arthusBase(): Promise<ArthusBase> {
  t = await createTestDb({ migrationSql: OLD_MIGRATION_SQL })
  await at(TODAY, 9)
  await t.db.exec(`update duel.settings set season_start = '2026-11-16';
    update duel.habits set active_from = '2026-11-16' where active_from = '2026-11-23';`)
  const arthus = await login(A, CODE_A)
  const laetitia = await login(L, CODE_L)
  const s = await snap(arthus)
  ok(await t.rpc(laetitia, 'ensure_stake', { p_week: TODAY, p_stake: s.settings.gages[1] }))
  await at(TODAY, 21, 30)
  const ids = {
    ongles: habitId(s, A, 'ongles'),
    grignotageA: habitId(s, A, 'grignotage'),
    sportA: habitId(s, A, 'sport'),
    grattage: habitId(s, L, 'grattage'),
    grignotageL: habitId(s, L, 'grignotage'),
    sportL: habitId(s, L, 'sport'),
  }
  ok(await setCheckin(arthus, ids.grignotageA, 'unpeu'))
  ok(await setCheckin(arthus, ids.ongles, 'nickel'))
  return { arthus, laetitia, ids }
}

afterEach(async () => {
  const db = t as TestDb | undefined
  t = undefined as unknown as TestDb
  await db?.close()
})

describe('Mise à jour de la base d’Arthus : Grignotage tout ou rien dès ce lundi 16', () => {
  let base: ArthusBase
  beforeEach(async () => {
    base = await arthusBase()
  })

  it('la base de départ est bien celle d’avant : contrainte « avoid / do », Grignotage avec « un peu »', async () => {
    expect(await kindConstraint()).toEqual([expect.stringMatching(/'avoid'.*'do'/)])
    expect((await kindConstraint())[0]).not.toContain('avoid_strict')
    // Le nom que Postgres avait donné à la contrainte (celui que la migration redéfinit).
    expect(await t.sql(`select conname::text as name from pg_constraint where conrelid = 'duel.habits'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%kind%'`)).toEqual([{ name: 'habits_kind_check' }])
    expect((await grignotages()).map((g) => g.kind)).toEqual(['avoid', 'avoid'])
    const s = await snap(base.arthus)
    expect(s.settings.seasonStart).toBe(TODAY)
    expect(s.checkins.map((c) => [c.habitId, c.value])).toEqual(
      [[base.ids.grignotageA, 'unpeu'], [base.ids.ongles, 'nickel']].sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    )
  })

  it('activation lancée AVANT la migration : elle s’arrête avec un message clair, rien n’est changé', async () => {
    const before = await dump()
    expect(await runError(ACTIVATION_SQL)).toEqual({ code: 'P0001', message: TOO_EARLY })
    expect(await dump()).toEqual(before)
    // La remise à zéro (nouvelle version) refuse aussi une base d'avant, sans rien effacer.
    expect(await runError(resetSql)).toEqual({
      code: 'P0001',
      message: `Ta base date d’une version d’avant${NBSP}: relance d’abord le script supabase/migrations/0001_duel.sql en entier, puis celui-ci. Rien n’a été effacé.`,
    })
    expect(await dump()).toEqual(before)
  })

  it('relancer la NOUVELLE migration ne touche à aucune donnée (Grignotage encore « à éviter »)', async () => {
    const before = await dump()
    const snapBefore = await snap(base.arthus)
    await migrate()
    expect(await dump()).toEqual(before)
    expect(await snap(base.arthus)).toEqual(snapBefore)
    // La contrainte accepte maintenant le tout ou rien.
    expect(await kindConstraint()).toEqual([expect.stringMatching(/'avoid'.*'avoid_strict'.*'do'/)])
    // Tant que l'activation n'est pas lancée, rien ne change pour les joueurs.
    ok(await setCheckin(base.laetitia, base.ids.grignotageL, 'unpeu'))
  })

  it('migration puis activation : Grignotage tout ou rien pour les deux, le reste intact, le « un peu » de ce soir vaut 5 pts', async () => {
    const before = await dump()
    const catalogBefore = await migrate().then(() => catalog())
    expect(await run(ACTIVATION_SQL)).toBe(DONE)
    const after = await dump()

    // Seuls les deux Grignotage changent de type (mêmes identifiants : séries et historique gardés).
    const grignotageIds = [base.ids.grignotageA, base.ids.grignotageL]
    const habitsBefore = before['duel.habits'] as { id: string; kind: string }[]
    expect(after['duel.habits']).toEqual(
      habitsBefore.map((h) => (grignotageIds.includes(h.id) ? { ...h, kind: 'avoid_strict' } : h)),
    )
    expect((await grignotages()).map((g) => [g.player_id, g.kind])).toEqual([
      [A, 'avoid_strict'],
      [L, 'avoid_strict'],
    ])
    // Le reste des données est intact (check-ins compris) ; le journal a un seul signal silencieux.
    const { 'duel.habits': _h1, 'public.events': eventsAfter, ...restAfter } = after
    const { 'duel.habits': _h2, 'public.events': eventsBefore, ...restBefore } = before
    expect(restAfter).toEqual(restBefore)
    expect(eventsAfter.slice(0, eventsBefore.length)).toEqual(eventsBefore)
    expect(eventsAfter.slice(eventsBefore.length).map((e) => [e.player_id, e.kind, e.day])).toEqual([[L, 'gages', null]])
    // Rien de nouveau à appeler pour un téléphone.
    expect(await catalog()).toEqual(catalogBefore)

    // Le « un peu » de ce soir est toujours là et compte 5 pts : 10 + 5 sur 30 → 50.
    const s = await snap(base.arthus)
    expect(s.habits.find((h) => h.id === base.ids.grignotageA)).toMatchObject({ kind: 'avoid_strict', activeFrom: TODAY, activeUntil: null })
    expect(s.checkins.find((c) => c.habitId === base.ids.grignotageA)?.value).toBe('unpeu')
    const day = () => snap(base.arthus).then((x) => buildSeason(x, TODAY).current.scores[A].days[0])
    expect(await day()).toMatchObject({ day: TODAY, points: 15, possible: 30, score: 50, filled: 2, complete: false })

    // Plus de nouveau « un peu » sur Grignotage (les deux), toujours sur Ongles et Grattage.
    expect((await setCheckin(base.arthus, base.ids.grignotageA, 'unpeu')).error).toMatchObject({ code: 'P0001', message: NO_UNPEU })
    expect((await setCheckin(base.laetitia, base.ids.grignotageL, 'unpeu')).error).toMatchObject({ code: 'P0001', message: NO_UNPEU })
    expect((await day()).points).toBe(15) // refusé : le « un peu » d'avant reste
    ok(await setCheckin(base.arthus, base.ids.sportA, 'fait'))
    expect(await day()).toMatchObject({ points: 25, score: 83, complete: true })
    ok(await setCheckin(base.arthus, base.ids.ongles, 'unpeu'))
    ok(await setCheckin(base.arthus, base.ids.ongles, 'nickel'))

    // Laetitia fait son check-in normalement (jour complet → checkin_done).
    const from = await t.lastEventId()
    ok(await setCheckin(base.laetitia, base.ids.grattage, 'unpeu'))
    ok(await setCheckin(base.laetitia, base.ids.grignotageL, 'nickel'))
    ok(await setCheckin(base.laetitia, base.ids.sportL, 'fait'))
    expect((await t.eventsSince(from)).map((e) => e.kind)).toEqual(['checkin', 'checkin', 'checkin_done'])
    const scores = buildSeason(await snap(base.laetitia), TODAY).current.scores
    expect(scores[L].days[0]).toMatchObject({ points: 25, score: 83, complete: true })
    expect(scores[A].days[0]).toMatchObject({ points: 25, score: 83, complete: true })
    // Corriger son Grignotage : Craquage ou Nickel, jamais « un peu ».
    ok(await setCheckin(base.arthus, base.ids.grignotageA, 'craquage'))
    ok(await setCheckin(base.arthus, base.ids.grignotageA, 'nickel'))
    expect(await day()).toMatchObject({ points: 30, score: 100, perfect: true })
  })

  it('relancer migration + activation une 2e fois ne change plus rien', async () => {
    await migrate()
    expect(await run(ACTIVATION_SQL)).toBe(DONE)
    const once = await dump()
    const snapOnce = await snap(base.arthus)
    await migrate()
    expect(await run(ACTIVATION_SQL)).toBe(DONE)
    expect(await dump()).toEqual(once)
    expect(await snap(base.arthus)).toEqual(snapOnce)
  })

  it('un téléphone (authenticated ou anon) ne peut pas lancer l’activation', async () => {
    await migrate()
    const before = await dump()
    for (const uid of [base.arthus, null]) {
      const role = uid ? 'authenticated' : 'anon'
      const attempt = t.db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid ?? '', role })])
        await tx.exec(`set local role ${role}`)
        await tx.exec(ACTIVATION_SQL)
      })
      await expect(attempt).rejects.toMatchObject({ code: '42501' })
    }
    expect(await dump()).toEqual(before)
  })

  it('étape 0 du README (l’app d’abord) : la nouvelle app marche sur la base d’avant, puis passe en tout ou rien sans recharger', async () => {
    // La nouvelle version est déployée et rouverte AVANT tout SQL : base encore d'avant.
    const phone = new OpenPhone(base.arthus)
    const src = new SupabaseSource({ client: phone, clock })
    const toasts: Activity[] = []
    src.subscribe((_s, activity) => {
      if (activity) toasts.push(activity)
    })
    try {
      await vi.waitFor(() => expect(src.signedIn && !src.loading && phone.subscribed).toBe(true), { timeout: 10_000 })
      const grignotage = () => src.getSnapshot().habits.find((h) => h.id === base.ids.grignotageA)!
      expect(grignotage().kind).toBe('avoid')
      expect(valuesFor(grignotage().kind)).toEqual(['nickel', 'unpeu', 'craquage'])
      // Tant que rien n'est lancé, Grignotage garde ses 3 réponses (le serveur d'avant aussi).
      await src.setCheckin(TODAY, base.ids.grignotageA, 'craquage')
      await src.setCheckin(TODAY, base.ids.grignotageA, 'unpeu')
      expect(src.getSnapshot()).toEqual(await snap(base.arthus))

      // 1. migration, 2. activation : le téléphone ouvert suit, sans notification.
      await migrate()
      expect(await run(ACTIVATION_SQL)).toBe(DONE)
      await phone.deliverEvents()
      await vi.waitFor(() => expect(grignotage().kind).toBe('avoid_strict'), { timeout: 10_000 })
      expect(valuesFor(grignotage().kind)).toEqual(['nickel', 'craquage'])
      expect(src.getSnapshot()).toEqual(await snap(base.arthus))
      await expect(src.setCheckin(TODAY, base.ids.grignotageA, 'unpeu')).rejects.toThrow(NO_UNPEU)
      await src.setCheckin(TODAY, base.ids.grignotageA, 'nickel')
      expect((await snap(base.arthus)).checkins.find((c) => c.habitId === base.ids.grignotageA)?.value).toBe('nickel')
      expect(toasts).toEqual([])
    } finally {
      src.dispose()
    }
  })

  it('le téléphone ouvert d’Arthus relit tout seul, sans notification', async () => {
    await migrate()
    const phone = new OpenPhone(base.arthus)
    const src = new SupabaseSource({ client: phone, clock })
    const toasts: Activity[] = []
    src.subscribe((_s, activity) => {
      if (activity) toasts.push(activity)
    })
    try {
      await vi.waitFor(() => expect(src.signedIn && !src.loading && phone.subscribed).toBe(true), { timeout: 10_000 })
      const kindOf = () => src.getSnapshot().habits.find((h) => h.id === base.ids.grignotageA)?.kind
      await vi.waitFor(() => expect(kindOf()).toBe('avoid'), { timeout: 10_000 })
      await run(ACTIVATION_SQL)
      expect((await phone.deliverEvents()).map((e) => [e.player_id, e.kind])).toEqual([[L, 'gages']])
      await vi.waitFor(() => expect(kindOf()).toBe('avoid_strict'), { timeout: 10_000 })
      expect(src.getSnapshot()).toEqual(await snap(base.arthus))
      // Le téléphone refuse lui aussi un nouveau « un peu », avec le même message.
      await expect(src.setCheckin(TODAY, base.ids.grignotageA, 'unpeu')).rejects.toThrow(NO_UNPEU)
      expect(toasts).toEqual([])
    } finally {
      src.dispose()
    }
  })
})

describe('Le script d’activation, ailleurs que sur la base d’Arthus', () => {
  it('base neuve (nouvelle migration) : Grignotage déjà tout ou rien, rien à faire', async () => {
    t = await createTestDb()
    await at(TODAY, 12)
    const before = await dump()
    expect((await grignotages()).map((g) => g.kind)).toEqual(['avoid_strict', 'avoid_strict'])
    expect(await run(ACTIVATION_SQL)).toBe(DONE)
    expect(await dump()).toEqual(before)
  })

  it('un Grignotage clos n’est pas touché ; un Grignotage qui finit lundi prochain l’est', async () => {
    await arthusBase()
    await migrate()
    // Laetitia : Grignotage désactivé depuis ce lundi ; Arthus : désactivation acceptée pour lundi 23.
    await t.db.exec(`update duel.habits set active_until = '2026-11-16' where badge_key = 'grignotage' and player_id = 'laetitia';
      update duel.habits set active_until = '2026-11-23' where badge_key = 'grignotage' and player_id = 'arthus';`)
    expect(await run(ACTIVATION_SQL)).toBe(
      `✅ Grignotage${NBSP}: Nickel ou Craquage, pour Arthus. ⚠️ Pas de Grignotage en cours pour Laetitia${NBSP}: rien n’a changé de ce côté.`,
    )
    expect((await grignotages()).map((g) => [g.player_id, g.kind])).toEqual([
      [A, 'avoid_strict'],
      [L, 'avoid'],
    ])
    // Plus aucun Grignotage en cours : on le dit.
    await t.db.exec(`update duel.habits set active_until = '2026-11-16' where badge_key = 'grignotage'`)
    expect(await run(ACTIVATION_SQL)).toBe(`⚠️ Aucun Grignotage en cours à passer en tout ou rien${NBSP}: rien n’a changé.`)
  })

  it('base vide (script principal jamais lancé) : même message, rien n’est créé', async () => {
    t = await createTestDb()
    await t.db.exec(`drop schema duel cascade`)
    expect(await runError(ACTIVATION_SQL)).toEqual({ code: 'P0001', message: TOO_EARLY })
  })

  it('le fichier : court, sans rien créer ni ouvrir à un téléphone', () => {
    const code = ACTIVATION_SQL.replace(/--.*$/gm, '')
    expect(code).not.toMatch(/\b(create|grant|alter|drop|comment on|security definer|truncate|delete)\b/i)
    // Ne touche qu'aux habitudes (et au journal, par duel.emit).
    expect([...code.matchAll(/\b(?:update|insert into)\s+([\w.]+)/gi)].map((m) => m[1])).toEqual(['duel.habits'])
    expect(code).toContain(`duel.emit(v_joueur, 'gages')`)
    expect(ACTIVATION_SQL.split('\n').length).toBeLessThan(80)
  })
})

// ─── Un téléphone ouvert (comme reset.test.ts) ─────────────────────────────

/** Ce que Realtime met dans payload.new (date → 'YYYY-MM-DD', int8 → nombre). */
const EVENTS_AS_SUBSCRIBER = `
  select id::integer as id, player_id, kind, to_char(day, 'YYYY-MM-DD') as day,
         to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
  from public.events where id > $1 order by id`

/** La vraie SupabaseSource sur la base PGlite ; le temps réel est livré à la main (deliverEvents). */
class OpenPhone implements SupabaseLike {
  readonly uid: string
  subscribed = false
  private handler: ((payload: { new: EventRow }) => void) | null = null
  private lastId = 0

  constructor(uid: string) {
    this.uid = uid
  }

  auth: SupabaseLike['auth'] = {
    getSession: async () => ({ data: { session: { user: { id: this.uid } } }, error: null }),
    signInAnonymously: async () => ({ data: { session: { user: { id: this.uid } } }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  }

  rpc(fn: RpcName, args: object = {}) {
    return t.rpc(this.uid, fn, args as Record<string, unknown>)
  }

  channel(): ChannelLike {
    const ch: ChannelLike = {
      on: (_type, _filter, callback) => {
        this.handler = callback
        return ch
      },
      subscribe: (callback) => {
        void t.lastEventId().then((id) => {
          this.lastId = id
          this.subscribed = true
          callback?.('SUBSCRIBED')
        })
        return ch
      },
    }
    return ch
  }

  async removeChannel(): Promise<unknown> {
    this.handler = null
    return 'ok'
  }

  /** Realtime : les nouvelles lignes de public.events que CETTE session a le droit de lire. */
  async deliverEvents(): Promise<EventRow[]> {
    const rows = ok(await t.asRole<EventRow>(this.uid, EVENTS_AS_SUBSCRIBER, [this.lastId]))
    for (const row of rows) {
      this.lastId = Math.max(this.lastId, row.id)
      this.handler?.({ new: row })
    }
    return rows
  }
}
