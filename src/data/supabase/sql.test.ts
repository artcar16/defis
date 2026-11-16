/**
 * Tests de la VRAIE migration Supabase (supabase/migrations/0001_duel.sql), exécutée dans
 * PGlite par le harnais ./pglite.ts. On vérifie la sécurité (connexion, accès, masquage des
 * kilos) et que les règles du serveur sont exactement celles de src/core.
 */
import { TZDate } from '@date-fns/tz'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GAGES, DEFAULT_HABITS, DEFAULT_PLAYERS, SEASON_START } from '../../config/defaults'
import { RULES, type Rules } from '../../config/rules'
import { addDays, dayKeyAt, daysRange, isoDayOf, nextMonday, weekStartOf } from '../../core/dates'
import { canEditCheckin, canWeighIn, isInGoalZone, percentChange, weighInPoints } from '../../core/scoring'
import { isStakeEditable } from '../../core/season'
import { BADGES } from '../../core/badges'
import { drawStake } from '../../core/stake'
import type { DayKey, DuelSnapshot, Habit, PlayerId, ProposalPayload, WeighInDayRule } from '../../core/types'
import { deriveWeighIns, type RawWeighIn } from '../../core/weight'
import { DemoSource } from '../demo/DemoSource'
import { maskChange, maskFromStart, maskGoalDistance, maskWeighIn, pctHalf, pctTenth } from '../mask'
import type { DemoState } from '../demo/generate'
import { CODE_LENGTH } from '../source'
import { SQLSTATE, type DuelRpc, type EventKind, type RpcName } from './api'
import { createTestDb, MIGRATION_SQL, type RpcResult, type TestDb } from './pglite'

// PGlite démarre en ~3 s, et certains tests balaient beaucoup de dates.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const A: PlayerId = 'arthus'
const L: PlayerId = 'laetitia'
const CODE = '123456'
const NOT_MEMBER = SQLSTATE.notMember
const RULE = SQLSTATE.rule
const PERMISSION_DENIED = '42501'

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(async () => {
  await t.reset()
})

// ─── Petits outils ─────────────────────────────────────────────────────────

/** Les entiers de a à b inclus. */
function intRange(a: number, b: number): number[] {
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
}

/** L'instant correspondant à une heure de Paris. */
function paris(day: DayKey, hour = 12, minute = 0): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(new TZDate(y, m - 1, d, hour, minute, 0, 0, 'Europe/Paris').getTime())
}

/** Fige l'horloge du serveur à une heure de Paris (midi par défaut). */
async function at(day: DayKey, hour = 12, minute = 0) {
  await t.setNow(paris(day, hour, minute))
}

function ok<T>(res: RpcResult<T>): T {
  expect(res.error).toBeNull()
  return res.data as T
}

function refused(res: RpcResult<unknown>, code: string = RULE, message?: string | RegExp) {
  expect(res.data).toBeNull()
  expect(res.error?.code).toBe(code)
  if (typeof message === 'string') expect(res.error?.message).toBe(message)
  else if (message) expect(res.error?.message).toMatch(message)
}

/** Un nouveau téléphone (session anonyme) lié à un joueur. */
async function login(player: PlayerId, code = CODE): Promise<string> {
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

async function failures(player: PlayerId): Promise<number> {
  const rows = await t.sql<{ n: number }>(`select count(*)::integer as n from duel.code_failures where player_id = $1`, [player])
  return rows[0].n
}

async function kinds(afterId: number): Promise<{ player: PlayerId; kind: EventKind; day: DayKey | null }[]> {
  return (await t.eventsSince(afterId)).map((e) => ({ player: e.player_id, kind: e.kind, day: e.day }))
}

/** Un exemple d'arguments valides pour chaque fonction (le type oblige à n'en oublier aucune). */
const SAMPLE_UUID = '00000000-0000-4000-8000-000000000000'
const SAMPLE_ARGS: { [N in RpcName]: DuelRpc[N]['args'] } = {
  login_players: {},
  claim_player: { p_player: A, p_code: CODE },
  change_code: { p_old: CODE, p_new: '654321' },
  clear_code_failures: {},
  release_device: {},
  get_snapshot: {},
  set_checkin: { p_day: SEASON_START, p_habit: SAMPLE_UUID, p_value: 'nickel' },
  save_weigh_in: { p_day: SEASON_START, p_kg: 70 },
  update_profile: { p_patch: { name: 'Toto' } },
  update_habit_look: { p_habit: SAMPLE_UUID, p_patch: { name: 'Toto' } },
  propose: { p_payload: { kind: 'weigh_day', isoDay: 3 } },
  answer_proposal: { p_id: SAMPLE_UUID, p_accept: true },
  cancel_proposal: { p_id: SAMPLE_UUID },
  set_stake: { p_week: SEASON_START, p_stake: 'Vaisselle' },
  ensure_stake: { p_week: SEASON_START, p_stake: 'Vaisselle' },
  set_gages: { p_gages: ['Vaisselle'] },
  set_gage_paid: { p_week: SEASON_START, p_player: L, p_paid: true },
  mark_results_seen: { p_week: SEASON_START },
  record_badge_unlocks: { p_unlocks: [{ badgeId: 'zen', tier: null, day: SEASON_START }] },
  mark_badges_seen: { p_keys: ['zen'] },
}
const RPC_NAMES = Object.keys(SAMPLE_ARGS) as RpcName[]

// ─── Connexion ─────────────────────────────────────────────────────────────

describe('Connexion par prénom + code', () => {
  it('le premier code crée, un 2e téléphone entre avec le même code', async () => {
    const before = ok(await t.rpc(null, 'login_players', {}))
    expect(before.map((p) => [p.id, p.hasCode])).toEqual([[L, false], [A, false]])

    const phone1 = await t.newUser()
    expect(ok(await t.rpc(phone1, 'claim_player', { p_player: A, p_code: CODE }))).toEqual({ created: true })
    const after = ok(await t.rpc(null, 'login_players', {}))
    expect(after.map((p) => [p.id, p.hasCode])).toEqual([[L, false], [A, true]])

    const phone2 = await t.newUser()
    expect(ok(await t.rpc(phone2, 'claim_player', { p_player: A, p_code: CODE }))).toEqual({ created: false })
    expect((await snap(phone1)).meId).toBe(A)
    expect((await snap(phone2)).meId).toBe(A)

    // Le code n'est jamais stocké en clair.
    const rows = await t.sql<{ code_hash: string }>(`select code_hash from duel.codes where player_id = $1`, [A])
    expect(rows[0].code_hash).toMatch(/^\$2[aby]\$/)
    expect(rows[0].code_hash).not.toContain(CODE)
  })

  it('un code faux est refusé ET compté (la transaction est validée malgré l’erreur)', async () => {
    await login(A)
    const phone = await t.newUser()
    refused(await t.rpc(phone, 'claim_player', { p_player: A, p_code: '000000' }), RULE, 'Code incorrect 🙅')
    expect(await failures(A)).toBe(1)
    refused(await t.rpc(phone, 'get_snapshot', {}), NOT_MEMBER)
    // Un bon code efface les échecs.
    ok(await t.rpc(phone, 'claim_player', { p_player: A, p_code: CODE }))
    expect(await failures(A)).toBe(0)
  })

  it('verrou après 10 échecs en 15 min, même avec le bon code, levé au bout de 15 min', async () => {
    await at('2026-11-24', 20, 0)
    await login(A)
    await login(L, '999999')
    const thief = await t.newUser()
    for (let i = 0; i < 10; i++) {
      refused(await t.rpc(thief, 'claim_player', { p_player: A, p_code: '000000' }), RULE, 'Code incorrect 🙅')
    }
    expect(await failures(A)).toBe(10)

    const me = await t.newUser()
    refused(await t.rpc(me, 'claim_player', { p_player: A, p_code: CODE }), RULE, /^Trop de codes faux 🥵 Réessaie dans 15 min/)
    refused(await t.rpc(me, 'get_snapshot', {}), NOT_MEMBER)
    // Les essais pendant le verrou ne sont pas comptés.
    expect(await failures(A)).toBe(10)
    // Laetitia n'est pas concernée.
    ok(await t.rpc(me, 'claim_player', { p_player: L, p_code: '999999' }))

    await at('2026-11-24', 20, 14)
    refused(await t.rpc(me, 'claim_player', { p_player: A, p_code: CODE }), RULE, /Réessaie dans 1 min/)
    await at('2026-11-24', 20, 15)
    expect(ok(await t.rpc(me, 'claim_player', { p_player: A, p_code: CODE }))).toEqual({ created: false })
    expect((await snap(me)).meId).toBe(A)
  })

  it('verrou posé par un inconnu : change_code marche quand même, et un téléphone lié débloque le prénom (SEC-3)', async () => {
    await at('2026-11-24', 20, 0)
    await login(A)
    const laetitia = await login(L)
    // Une session anonyme jamais liée (l'URL et la clé publishable suffisent) bloque le prénom.
    const stranger = await t.newUser()
    for (let i = 0; i < 10; i++) {
      refused(await t.rpc(stranger, 'claim_player', { p_player: L, p_code: String(100000 + i) }), RULE, 'Code incorrect 🙅')
    }
    const rows = await t.sql<{ user_id: string }>(`select user_id::text as user_id from duel.code_failures`)
    expect(rows.map((r) => r.user_id)).toEqual(Array(10).fill(stranger))
    const newPhone = await t.newUser()
    refused(await t.rpc(newPhone, 'claim_player', { p_player: L, p_code: CODE }), RULE, /^Trop de codes faux/)

    // Le téléphone de Laetitia, déjà lié, change son code : les essais de l'inconnu ne comptent pas.
    ok(await t.rpc(laetitia, 'change_code', { p_old: CODE, p_new: '222222' }))
    // Ses propres erreurs, si : 10 anciens codes faux depuis CE téléphone, et il doit attendre.
    for (let i = 0; i < 10; i++) {
      refused(await t.rpc(laetitia, 'change_code', { p_old: '999999', p_new: '333333' }), RULE, 'Code incorrect 🙅')
    }
    refused(await t.rpc(laetitia, 'change_code', { p_old: '222222', p_new: '333333' }), RULE, /^Trop de codes faux/)

    // Le prénom est de nouveau bloqué à l'écran de connexion ; Laetitia le débloque depuis son
    // téléphone, et apprend combien de codes faux il y avait.
    refused(await t.rpc(newPhone, 'claim_player', { p_player: L, p_code: '222222' }), RULE, /^Trop de codes faux/)
    expect(ok(await t.rpc(laetitia, 'clear_code_failures', {}))).toBe(10)
    expect(await failures(L)).toBe(0)
    expect(ok(await t.rpc(newPhone, 'claim_player', { p_player: L, p_code: '222222' }))).toEqual({ created: false })
    // Rien à débloquer : 0 ; et seulement pour une session liée.
    expect(ok(await t.rpc(laetitia, 'clear_code_failures', {}))).toBe(0)
    refused(await t.rpc(stranger, 'clear_code_failures', {}), NOT_MEMBER)
    // Débloquer n'efface que son prénom.
    await t.rpc(stranger, 'claim_player', { p_player: A, p_code: '000000' })
    ok(await t.rpc(laetitia, 'clear_code_failures', {}))
    expect(await failures(A)).toBe(1)
  })

  it(`le code fait exactement ${CODE_LENGTH} chiffres (sans compter d’échec)`, async () => {
    expect(CODE_LENGTH).toBe(6)
    const phone = await t.newUser()
    for (const code of ['12345', '1234567', 'abcdef', '12 456', '', '١٢٣٤٥٦', '123456\n']) {
      refused(await t.rpc(phone, 'claim_player', { p_player: A, p_code: code }), RULE, 'Le code, c’est 6 chiffres 🔢')
    }
    expect(await failures(A)).toBe(0)
    expect(ok(await t.rpc(null, 'login_players', {})).every((p) => !p.hasCode)).toBe(true)
    refused(await t.rpc(phone, 'claim_player', { p_player: 'bob', p_code: CODE }), RULE, 'Joueur inconnu 🤔')
  })

  it('change_code : l’ancien code doit être bon (sinon compté) ; ce téléphone reste connecté, les autres non (SEC-4)', async () => {
    const phone1 = await login(A)
    // Quelqu'un a vu le code et s'en est servi sur son téléphone.
    const intruder = await login(A)
    const laetitia = await login(L)
    refused(await t.rpc(phone1, 'change_code', { p_old: '111111', p_new: '222222' }), RULE, 'Code incorrect 🙅')
    expect(await failures(A)).toBe(1)
    refused(await t.rpc(phone1, 'change_code', { p_old: CODE, p_new: '22' }), RULE, 'Le code, c’est 6 chiffres 🔢')
    expect((await snap(intruder)).meId).toBe(A) // un échec ne déconnecte personne
    expect(ok(await t.rpc(phone1, 'change_code', { p_old: CODE, p_new: '222222' }))).toBeNull()
    expect(await failures(A)).toBe(0)

    // L'intrus est dehors : plus rien à lire ni à faire au nom d'Arthus.
    refused(await t.rpc(intruder, 'get_snapshot', {}), NOT_MEMBER, 'Connecte-toi d’abord 🔑')
    refused(await t.rpc(intruder, 'update_profile', { p_patch: { name: 'Pirate' } }), NOT_MEMBER)
    refused(await t.rpc(intruder, 'claim_player', { p_player: A, p_code: CODE }), RULE, 'Code incorrect 🙅')
    // Ce téléphone-ci, et Laetitia, restent connectés.
    expect((await snap(phone1)).meId).toBe(A)
    expect((await snap(laetitia)).meId).toBe(L)
    expect((await t.sql(`select player_id from duel.devices order by player_id`)).map((r) => r.player_id)).toEqual([A, L])

    const phone2 = await t.newUser()
    ok(await t.rpc(phone2, 'claim_player', { p_player: A, p_code: '222222' }))
    refused(await t.rpc(await t.newUser(), 'change_code', { p_old: CODE, p_new: '222222' }), NOT_MEMBER)
  })

  it('duel.reset_code (SQL Editor) : nouveau code, TOUS les téléphones du joueur dehors, aucun téléphone ne peut l’appeler (SEC-4, SEC-5)', async () => {
    const arthus = await login(A)
    const arthus2 = await login(A)
    const laetitia = await login(L)
    await t.rpc(await t.newUser(), 'claim_player', { p_player: A, p_code: '000000' })
    expect(await failures(A)).toBe(1)
    // La ligne du README.
    const [{ msg }] = await t.sql<{ msg: string }>(`select duel.reset_code('arthus', '482916') as msg`)
    expect(msg).toMatch(/^Code de arthus changé ✅/)
    for (const uid of [arthus, arthus2]) refused(await t.rpc(uid, 'get_snapshot', {}), NOT_MEMBER)
    expect((await snap(laetitia)).meId).toBe(L)
    expect(await failures(A)).toBe(0)
    // Le prénom a toujours un code : personne ne peut « le prendre » avec le premier code venu.
    expect(ok(await t.rpc(null, 'login_players', {})).find((p) => p.id === A)?.hasCode).toBe(true)
    refused(await t.rpc(await t.newUser(), 'claim_player', { p_player: A, p_code: CODE }), RULE, 'Code incorrect 🙅')
    expect(ok(await t.rpc(arthus, 'claim_player', { p_player: A, p_code: '482916' }))).toEqual({ created: false })
    // Poser les codes à l'avance, sur une base neuve : le premier code tapé n'est plus « créé ».
    await t.sql(`select duel.reset_code('laetitia', '135790')`)
    expect(ok(await t.rpc(await t.newUser(), 'claim_player', { p_player: L, p_code: '135790' }))).toEqual({ created: false })
    // Garde-fous, et réservé au SQL Editor.
    await expect(t.sql(`select duel.reset_code('arthus', '12')`)).rejects.toThrow('Le code, c’est 6 chiffres 🔢')
    await expect(t.sql(`select duel.reset_code('bob', '123456')`)).rejects.toThrow('Joueur inconnu 🤔')
    for (const who of [laetitia, null]) {
      expect((await t.asRole(who, `select duel.reset_code('arthus', '111111')`)).error?.code).toBe(PERMISSION_DENIED)
    }
    expect((await t.rpc(laetitia, 'reset_code', { p_player: A, p_code: '111111' })).error?.code).toBe('PGRST202')
  })

  it('release_device ne délie que ce téléphone', async () => {
    const phone1 = await login(A)
    const phone2 = await login(A)
    expect(ok(await t.rpc(phone1, 'release_device', {}))).toBeNull()
    refused(await t.rpc(phone1, 'get_snapshot', {}), NOT_MEMBER, 'Connecte-toi d’abord 🔑')
    expect((await snap(phone2)).meId).toBe(A)
    // Déjà délié : rien à faire, pas d'erreur.
    ok(await t.rpc(phone1, 'release_device', {}))
    // Le compte anonyme supprimé emporte le lien.
    await t.sql(`delete from auth.users where id = $1`, [phone2])
    expect((await t.sql(`select * from duel.devices`)).length).toBe(0)
  })

  it('une session non liée reçoit 28000 sur la lecture et sur chaque action', async () => {
    await login(A)
    const stranger = await t.newUser()
    const linkFree: RpcName[] = ['login_players', 'claim_player', 'release_device']
    for (const name of RPC_NAMES.filter((n) => !linkFree.includes(n))) {
      const res = await t.rpc(stranger, name, SAMPLE_ARGS[name])
      expect(res.error?.code, name).toBe(NOT_MEMBER)
      expect(res.error?.message, name).toBe('Connecte-toi d’abord 🔑')
    }
  })

  it('sans session (anon), seule login_players répond', async () => {
    for (const name of RPC_NAMES) {
      const res = await t.rpc(null, name, SAMPLE_ARGS[name])
      if (name === 'login_players') expect(res.error, name).toBeNull()
      else expect(res.error?.code, name).toBe(PERMISSION_DENIED)
    }
    expect((await t.sql(`select * from duel.devices`)).length).toBe(0)
  })

  it('une fonction inconnue ou de mauvais arguments → PGRST202 (comme PostgREST)', async () => {
    const uid = await login(A)
    expect((await t.rpc(uid, 'drop_everything', {})).error?.code).toBe('PGRST202')
    expect((await t.rpc(uid, 'set_stake', { p_week: SEASON_START })).error?.code).toBe('PGRST202')
  })
})

// ─── Accès direct ──────────────────────────────────────────────────────────

describe('Accès direct aux tables', () => {
  it('toutes les tables duel : RLS sans règle, et ni anon ni authenticated n’y touchent', async () => {
    const uid = await login(A)
    const tables = await t.sql<{ name: string; rls: boolean }>(
      `select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'duel' and c.relkind = 'r' order by 1`,
    )
    expect(tables.map((x) => x.name)).toEqual(
      [
        'badge_unlocks', 'checkins', 'code_failures', 'codes', 'devices', 'gage_payments', 'goals', 'habits',
        'players', 'proposal_goals', 'proposals', 'rules', 'seen_badges', 'seen_results', 'settings', 'weeks',
        'weigh_days', 'weigh_ins',
      ].sort(),
    )
    expect(tables.every((x) => x.rls)).toBe(true)
    expect(await t.sql(`select * from pg_policies where schemaname = 'duel'`)).toEqual([])

    for (const { name } of tables) {
      for (const who of [uid, null]) {
        const read = await t.asRole(who, `select * from duel.${name}`)
        expect(read.error?.code, `${name} lu par ${who ?? 'anon'}`).toBe(PERMISSION_DENIED)
        const del = await t.asRole(who, `delete from duel.${name}`)
        expect(del.error?.code, `${name} vidé par ${who ?? 'anon'}`).toBe(PERMISSION_DENIED)
      }
    }
    // Pas même les fonctions internes.
    expect((await t.asRole(uid, `select duel.today()`)).error?.code).toBe(PERMISSION_DENIED)
  })

  it('les fonctions publiques sont exactement celles du contrat, SECURITY DEFINER et search_path vide', async () => {
    const fns = await t.sql<{ name: string; definer: boolean; config: string[] | null; anon: boolean; auth: boolean }>(
      `select p.proname as name, p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`,
    )
    expect(fns.map((f) => f.name)).toEqual([...RPC_NAMES, 'is_duel_member'].sort())
    for (const f of fns) {
      expect(f.definer, f.name).toBe(true)
      expect(f.config, f.name).toContain('search_path=""')
      expect(f.anon, f.name).toBe(f.name === 'login_players')
      expect(f.auth, f.name).toBe(true)
    }
  })

  it('public.events : lisible seulement par une session liée, jamais modifiable, sans rien de privé', async () => {
    await at('2026-11-29')
    const arthus = await login(A)
    const laetitia = await login(L)
    ok(await t.rpc(arthus, 'save_weigh_in', { p_day: '2026-11-29', p_kg: 81.4 }))

    const cols = await t.sql<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'events' order by ordinal_position`,
    )
    expect(cols.map((c) => c.column_name)).toEqual(['id', 'player_id', 'kind', 'day', 'created_at'])

    const seen = ok(await t.asRole<{ kind: string }>(laetitia, `select * from public.events`))
    expect(seen.map((e) => e.kind)).toEqual(['weighin'])
    expect(JSON.stringify(seen)).not.toContain('81')

    expect(ok(await t.asRole(await t.newUser(), `select * from public.events`))).toEqual([])
    expect((await t.asRole(null, `select * from public.events`)).error?.code).toBe(PERMISSION_DENIED)
    for (const sql of [
      `insert into public.events (player_id, kind) values ('arthus', 'checkin')`,
      `update public.events set kind = 'checkin'`,
      `delete from public.events`,
    ]) {
      expect((await t.asRole(laetitia, sql)).error?.code, sql).toBe(PERMISSION_DENIED)
    }
    // Temps réel : la table est publiée.
    const pub = await t.sql(`select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'events'`)
    expect(pub.length).toBe(1)
  })

  it('les événements de plus de 60 jours sont purgés au fil des insertions', async () => {
    await at('2026-11-23')
    const arthus = await login(A)
    ok(await t.rpc(arthus, 'update_profile', { p_patch: { emoji: '🐼' } }))
    await at('2027-01-21')
    ok(await t.rpc(arthus, 'update_profile', { p_patch: { emoji: '🐻' } }))
    expect((await t.eventsSince()).length).toBe(2)
    await at('2027-01-23')
    ok(await t.rpc(arthus, 'update_profile', { p_patch: { emoji: '🐼' } }))
    expect((await t.eventsSince()).map((e) => e.created_at.slice(0, 10))).toEqual(['2027-01-21', '2027-01-23'])
  })
})

// ─── Masquage des kilos ────────────────────────────────────────────────────

describe('Masquage des kilos (garantie 3, décision 18)', () => {
  it('kg et objectifs de l’autre masqués ; mes % exacts au bit près, les siens arrondis (SEC-1)', async () => {
    const arthus = await login(A)
    const laetitia = await login(L)
    const raw: RawWeighIn[] = []
    const weigh = async (uid: string, playerId: PlayerId, day: DayKey, weightKg: number) => {
      ok(await t.rpc(uid, 'save_weigh_in', { p_day: day, p_kg: weightKg }))
      raw.push({ playerId, day, weightKg })
    }
    const goalProposal = async (uid: string, goalKg: number | null) =>
      ok(
        await t.rpc(uid, 'propose', {
          p_payload: { kind: 'goal_weight', clear: goalKg === null, goalKg, goalFromStartPct: null },
        }),
      ) as string

    // Pesée de départ le dimanche d'avant, puis objectifs acceptés (effet le lundi suivant).
    await at('2026-11-22', 8)
    await weigh(arthus, A, '2026-11-22', 80.3)
    await weigh(laetitia, L, '2026-11-22', 64.7)
    ok(await t.rpc(laetitia, 'answer_proposal', { p_id: await goalProposal(arthus, 72.5), p_accept: true }))
    await at('2026-11-29', 9)
    await weigh(arthus, A, '2026-11-29', 79.6)
    await weigh(laetitia, L, '2026-11-29', 64.2)
    ok(await t.rpc(arthus, 'answer_proposal', { p_id: await goalProposal(laetitia, 60), p_accept: true }))
    await at('2026-12-06', 9)
    await weigh(arthus, A, '2026-12-06', 79.1)
    await weigh(laetitia, L, '2026-12-06', 63.9)
    // Une nouvelle proposition d'Arthus, en attente.
    await goalProposal(arthus, 75)

    const goals: Record<PlayerId, { from: DayKey; kg: number }> = {
      [A]: { from: '2026-11-23', kg: 72.5 },
      [L]: { from: '2026-11-30', kg: 60 },
    }
    const goalAt = (pid: PlayerId, day: DayKey) => (day >= goals[pid].from ? goals[pid].kg : null)

    // Vu par chacun : ses pesées exactes au bit près ; celles de l'autre sans kilos et aux %
    // arrondis exactement comme ../mask.ts (miroir de duel.mask_*).
    const exact = deriveWeighIns(raw, goalAt)
    const seenBy = (viewer: PlayerId) => exact.map((w) => (w.playerId === viewer ? w : maskWeighIn(w)))
    const seenByArthus = await snap(arthus)
    expect(seenByArthus.weighIns).toStrictEqual(seenBy(A))
    // Les miennes sont de vrais flottants (pas des valeurs arrondies) : comparaison au bit près.
    expect(String(seenByArthus.weighIns.find((w) => w.playerId === A && w.day === '2026-11-29')?.changePct)).toMatch(/\d{12}/)
    const seenByLaetitia = await snap(laetitia)
    expect(seenByLaetitia.weighIns).toStrictEqual(seenBy(L))
    // Ce que l'app déduit des pesées de l'autre est le même que chez lui : points, zone objectif.
    for (const w of exact) {
      const other = (w.playerId === A ? seenByLaetitia : seenByArthus).weighIns.find((x) => x.playerId === w.playerId && x.day === w.day)!
      expect(other.weightKg).toBeNull()
      expect(weighInPoints(other), `${w.playerId} ${w.day}`).toBe(weighInPoints(w))
      expect(isInGoalZone(other.goalDistancePct)).toBe(isInGoalZone(w.goalDistancePct))
      expect(Math.abs(other.fromStartPct - w.fromStartPct)).toBeLessThan(0.1)
    }

    const player = (s: DuelSnapshot, id: PlayerId) => s.players.find((p) => p.id === id)!
    expect(player(seenByArthus, A)).toMatchObject({ goalKg: 72.5, goalFromStartPct: percentChange(80.3, 72.5) })
    expect(player(seenByArthus, L)).toMatchObject({ goalKg: null, goalFromStartPct: pctHalf(percentChange(64.7, 60)) })
    expect(player(seenByLaetitia, A)).toMatchObject({ goalKg: null, goalFromStartPct: -9.5 })
    expect(player(seenByLaetitia, L)).toMatchObject({ goalKg: 60, goalFromStartPct: percentChange(64.7, 60) })

    // Propositions d'objectif : les kilos de l'autre masqués, le % au dixième (le même pour tous).
    const goalPayloads = (s: DuelSnapshot, author: PlayerId) =>
      s.proposals.filter((p) => p.authorId === author).map((p) => p.payload)
    expect(goalPayloads(seenByLaetitia, A)).toStrictEqual([
      { kind: 'goal_weight', clear: false, goalKg: null, goalFromStartPct: -9.5 },
      { kind: 'goal_weight', clear: false, goalKg: null, goalFromStartPct: -6.5 },
    ])
    expect(goalPayloads(seenByArthus, A)).toStrictEqual([
      { kind: 'goal_weight', clear: false, goalKg: 72.5, goalFromStartPct: -9.5 },
      { kind: 'goal_weight', clear: false, goalKg: 75, goalFromStartPct: -6.5 },
    ])
    expect(goalPayloads(seenByArthus, L)).toStrictEqual([
      { kind: 'goal_weight', clear: false, goalKg: null, goalFromStartPct: pctHalf(percentChange(64.7, 60)) },
    ])
    // Les kilos ne sont jamais rangés dans le payload, ni un % exact.
    expect(await t.sql(`select * from duel.proposals where payload ? 'goalKg'`)).toEqual([])

    // « Montrer mes kilos » : l'autre les voit, partout, avec les % exacts.
    ok(await t.rpc(laetitia, 'update_profile', { p_patch: { showKg: true } }))
    const revealed = await snap(arthus)
    expect(revealed.weighIns).toStrictEqual(exact)
    expect(player(revealed, L)).toMatchObject({ showKg: true, goalKg: 60, goalFromStartPct: percentChange(64.7, 60) })
    expect(goalPayloads(revealed, L).map((p) => (p.kind === 'goal_weight' ? p.goalKg : 'x'))).toEqual([60])
    // … mais pas ceux d'Arthus, qui ne les montre pas.
    expect((await snap(laetitia)).weighIns.filter((w) => w.playerId === A).every((w) => w.weightKg === null)).toBe(true)
  })

  it('duel.mask_* = ../mask.ts au bit près, et l’arrondi ne change ni les points, ni la zone objectif, ni les paliers 🪶', async () => {
    // Toutes les variations possibles entre deux poids au dixième (45 à 130 kg), plus les cas limites.
    const pcts = new Set<number>()
    for (let from = 450; from <= 1300; from += 7) {
      for (let d = -160; d <= 60; d++) pcts.add(percentChange(from / 10, (from + d) / 10))
    }
    const limits: [number, number][] = [
      [80, 79.9], [80, 79.2], [70, 69.3], [90, 89.1], [100, 99], [200, 198], [80, 80.8], [64.5, 65.1], [64.5, 63.9],
      [100, 98], [100, 95], [100, 90], [80, 78.4], [60, 57], [150, 135], [72.5, 73.2], [72.5, 71.8], [50, 49.995],
    ]
    for (const [from, to] of limits) pcts.add(percentChange(from, to))
    const xs = [...pcts]
    const [row] = await t.sql<{ change: number[]; start: number[]; goal: number[]; tenth: number[]; half: number[] }>(
      `select array_agg(duel.mask_change(u.x) order by u.i) as change,
              array_agg(duel.mask_from_start(u.x) order by u.i) as start,
              array_agg(duel.mask_goal_distance(u.x) order by u.i) as goal,
              array_agg(duel.pct_tenth(u.x) order by u.i) as tenth,
              array_agg(duel.pct_half(u.x) order by u.i) as half
       from unnest($1::float8[]) with ordinality as u(x, i)`,
      [xs],
    )
    expect(row.change).toEqual(xs.map((x) => maskChange(x)))
    expect(row.start).toEqual(xs.map((x) => maskFromStart(x)))
    expect(row.goal).toEqual(xs.map((x) => maskGoalDistance(x)))
    expect(row.tenth).toEqual(xs.map((x) => pctTenth(x)))
    expect(row.half).toEqual(xs.map((x) => pctHalf(x)))

    const tenths = (pct: number) => Math.floor(-pct * 10 + 1e-6) // progression 🪶 (badges.ts)
    xs.forEach((x, i) => {
      const [change, start, goal] = [row.change[i], row.start[i], row.goal[i]]
      // Mêmes points de pesée (variation seule, et avec ou sans zone objectif).
      expect(weighInPoints({ changePct: change, goalDistancePct: null }), `changePct ${x}`).toBe(weighInPoints({ changePct: x, goalDistancePct: null }))
      expect(isInGoalZone(goal), `goalDistancePct ${x}`).toBe(isInGoalZone(x))
      expect(weighInPoints({ changePct: change, goalDistancePct: goal })).toBe(weighInPoints({ changePct: x, goalDistancePct: x }))
      // Mêmes paliers 🪶, même progression.
      for (const tier of RULES.badges.featherTiersPct) expect(start <= -tier + 1e-9, `fromStartPct ${x}`).toBe(x <= -tier + 1e-9)
      expect(Math.max(0, tenths(start))).toBe(Math.max(0, tenths(x)))
      // Proches de la vraie valeur, et pas plus précis que l'affichage (ou que les points).
      expect(Math.abs(change - x)).toBeLessThanOrEqual(0.1 + 1e-9)
      expect(Math.abs(start - x)).toBeLessThan(0.1 + 1e-9)
      expect(Math.abs(goal - x)).toBeLessThanOrEqual(1 + 1e-9)
      for (const [v, step] of [[change, 100], [start, 10], [goal, 1], [row.half[i], 2]] as const) {
        expect(Math.abs(v * step - Math.round(v * step)), `${v} au 1/${step}`).toBeLessThan(1e-9)
      }
    })
  })

  it('avec ce que reçoit l’autre, on ne retrouve plus les kilos (le cas de la relecture SEC-1)', async () => {
    const arthus = await login(A)
    const laetitia = await login(L)
    // Laetitia (kilos cachés) : départ 71,3 ; objectif 64,5 accepté ; 70,6 puis 70,9 ; propose 66,2.
    await at('2026-11-22', 12)
    ok(await t.rpc(laetitia, 'save_weigh_in', { p_day: '2026-11-22', p_kg: 71.3 }))
    const g1 = ok(await t.rpc(laetitia, 'propose', { p_payload: { kind: 'goal_weight', clear: false, goalKg: 64.5, goalFromStartPct: null } }))
    ok(await t.rpc(arthus, 'answer_proposal', { p_id: g1, p_accept: true }))
    await at('2026-11-29', 12)
    ok(await t.rpc(laetitia, 'save_weigh_in', { p_day: '2026-11-29', p_kg: 70.6 }))
    await at('2026-12-06', 12)
    ok(await t.rpc(laetitia, 'save_weigh_in', { p_day: '2026-12-06', p_kg: 70.9 }))
    ok(await t.rpc(laetitia, 'propose', { p_payload: { kind: 'goal_weight', clear: false, goalKg: 66.2, goalFromStartPct: null } }))

    const s = await snap(arthus)
    const [w0, w1, w2] = s.weighIns.filter((w) => w.playerId === L)
    const goalPct = s.players.find((p) => p.id === L)!.goalFromStartPct!
    const proposed = s.proposals.filter((p) => p.authorId === L && p.status === 'pending')[0].payload
    const proposedPct = proposed.kind === 'goal_weight' ? proposed.goalFromStartPct! : NaN
    expect([w0.changePct, w0.fromStartPct, w0.goalDistancePct]).toEqual([null, 0, null])

    // Pour chaque départ possible (30,0 à 250,0 kg) : existe-t-il des kilos (au dixième) qui
    // redonnent EXACTEMENT tout ce qu'Arthus a reçu ?
    const pct = (from: number, to: number) => percentChange(from / 10, to / 10)
    const near = (start: number, p: number) => {
      const guess = Math.round(start * (1 + p / 100))
      return intRange(Math.max(300, guess - 12), Math.min(2500, guess + 12))
    }
    /** Départs compatibles ; `withGoal` faux : seulement ce que le score rend public de toute façon. */
    const compatibleStarts = (withGoal: boolean): number[] => {
      const out: number[] = []
      for (let S = 300; S <= 2500; S++) {
        const k1s = near(S, w1.fromStartPct).filter((k) => maskFromStart(pct(S, k)) === w1.fromStartPct && maskChange(pct(S, k)) === w1.changePct)
        const k2s = near(S, w2.fromStartPct).filter((k) => maskFromStart(pct(S, k)) === w2.fromStartPct)
        const goals = withGoal ? near(S, goalPct).filter((g) => pctHalf(pct(S, g)) === goalPct) : []
        const fits = k1s.some((k1) =>
          k2s.some(
            (k2) =>
              maskChange(pct(k1, k2)) === w2.changePct &&
              (!withGoal ||
                goals.some((g) => maskGoalDistance(pct(g, k1)) === w1.goalDistancePct && maskGoalDistance(pct(g, k2)) === w2.goalDistancePct)),
          ),
        )
        const proposedFits = !withGoal || near(S, proposedPct).some((p) => pctHalf(pct(S, p)) === proposedPct)
        if (fits && proposedFits) out.push(S / 10)
      }
      return out
    }
    const starts = compatibleStarts(true)
    // Le vrai départ en fait partie… au milieu de beaucoup d'autres (la relecture en trouvait 2 :
    // 71,3 et son double 142,6).
    expect(starts).toContain(71.3)
    expect(starts.length).toBeGreaterThanOrEqual(100)
    // Même en sachant qu'elle pèse « autour de 70 kg » : plusieurs départs possibles, et
    // l'objectif n'apprend rien de plus que les points de pesée (publics, via le score).
    const around = (list: number[]) => list.filter((x) => Math.abs(x - 71.3) <= 5)
    expect(around(starts).length).toBeGreaterThanOrEqual(5)
    expect(around(starts)).toEqual(around(compatibleStarts(false)))
  })

  it('objectif retiré : plus d’objectif à partir du lundi suivant', async () => {
    const arthus = await login(A)
    const laetitia = await login(L)
    await at('2026-11-22')
    ok(await t.rpc(arthus, 'save_weigh_in', { p_day: '2026-11-22', p_kg: 80 }))
    const propose = async (payload: ProposalPayload) => {
      const id = ok(await t.rpc(arthus, 'propose', { p_payload: payload })) as string
      ok(await t.rpc(laetitia, 'answer_proposal', { p_id: id, p_accept: true }))
    }
    await propose({ kind: 'goal_weight', clear: false, goalKg: 76, goalFromStartPct: null })
    await at('2026-11-25')
    expect((await snap(arthus)).players.find((p) => p.id === A)).toMatchObject({ goalKg: 76, goalFromStartPct: percentChange(80, 76) })
    await propose({ kind: 'goal_weight', clear: true, goalKg: null, goalFromStartPct: null })
    expect((await snap(arthus)).players.find((p) => p.id === A)?.goalKg).toBe(76)
    await at('2026-11-30')
    expect((await snap(arthus)).players.find((p) => p.id === A)).toMatchObject({ goalKg: null, goalFromStartPct: null })
  })
})

// ─── Parité des règles ─────────────────────────────────────────────────────

describe('Parité des règles avec src/core', () => {
  it('set_checkin accepté ⇔ canEditCheckin (lundi, dimanche, début de saison, changement de semaine)', async () => {
    const arthus = await login(A)
    const ongles = habitId(await snap(arthus), A, 'ongles')
    const sweep = async (rules: Rules) => {
      for (const today of daysRange('2026-11-19', '2026-12-09')) {
        await at(today)
        for (const day of daysRange(addDays(today, -3), addDays(today, 1))) {
          const res = await t.rpc(arthus, 'set_checkin', { p_day: day, p_habit: ongles, p_value: 'nickel' })
          const expected = canEditCheckin(day, today, { seasonStart: SEASON_START }, rules)
          expect(res.error === null, `${day} vu le ${today} : ${res.error?.message}`).toBe(expected)
          if (!expected && day >= SEASON_START) expect(res.error?.message).toBe('Ce jour n’est plus modifiable 🔒')
        }
      }
    }
    await sweep(RULES)
    // Mêmes résultats avec d'autres réglages (la table des règles est bien lue).
    await t.sql(`update duel.rules set catch_up_days = 2, catch_up_across_weeks = true`)
    await sweep({ ...RULES, checkin: { ...RULES.checkin, catchUpDays: 2, catchUpAcrossWeeks: true } })
  })

  it('les jours sont ceux de Paris (23:30 et 00:30, en hiver et en été)', async () => {
    for (const instant of [
      '2026-11-29T22:30:00Z', '2026-11-29T23:30:00Z', '2027-06-13T21:30:00Z', '2027-06-13T22:30:00Z',
      '2027-03-27T23:30:00Z', '2027-03-28T00:30:00Z', '2027-03-28T01:30:00Z', '2027-10-30T22:30:00Z',
      '2027-10-31T00:30:00Z', '2027-10-31T01:30:00Z', '2027-10-31T23:30:00Z',
    ]) {
      await t.setNow(instant)
      const rows = await t.sql<{ today: string }>(`select to_char(duel.today(), 'YYYY-MM-DD') as today`)
      expect(rows[0].today, instant).toBe(dayKeyAt(new Date(instant)))
    }

    const arthus = await login(A)
    const ongles = habitId(await snap(arthus), A, 'ongles')
    const checkin = (day: DayKey) => t.rpc(arthus, 'set_checkin', { p_day: day, p_habit: ongles, p_value: 'unpeu' })
    for (const [sunday, monday] of [
      ['2026-11-29', '2026-11-30'], // hiver (UTC+1)
      ['2027-06-13', '2027-06-14'], // été (UTC+2)
    ]) {
      // Dimanche 23:30 : la manche est encore ouverte, et c'est le jour de la pesée.
      await at(sunday, 23, 30)
      ok(await checkin(sunday))
      ok(await t.rpc(arthus, 'save_weigh_in', { p_day: sunday, p_kg: 80 }))
      // Lundi 00:30 : la manche est close, on est lundi.
      await at(monday, 0, 30)
      refused(await checkin(sunday), RULE, 'Ce jour n’est plus modifiable 🔒')
      ok(await checkin(monday))
      refused(await t.rpc(arthus, 'save_weigh_in', { p_day: sunday, p_kg: 80 }), RULE, 'Ce n’est pas le jour de la pesée ⚖️')
      refused(await t.rpc(arthus, 'save_weigh_in', { p_day: monday, p_kg: 80 }), RULE, 'Ce n’est pas le jour de la pesée ⚖️')
    }
  })

  it('save_weigh_in accepté ⇔ jour = aujourd’hui et canWeighIn (avec des règles de jour de pesée)', async () => {
    const arthus = await login(A)
    const weighInDays: WeighInDayRule[] = [
      { from: '2026-11-30', isoDay: 3 },
      { from: '2026-12-14', isoDay: 5 },
    ]
    for (const r of weighInDays) await t.sql(`insert into duel.weigh_days (from_day, iso_day) values ($1, $2)`, [r.from, r.isoDay])
    const sweep = async (rules: Rules) => {
      for (const today of daysRange('2026-11-20', '2026-12-27')) {
        await at(today, 7)
        for (const day of [addDays(today, -1), today, addDays(today, 1)]) {
          const res = await t.rpc(arthus, 'save_weigh_in', { p_day: day, p_kg: 80 })
          const expected = day === today && canWeighIn(today, { weighInDays }, rules)
          expect(res.error === null, `${day} vu le ${today} : ${res.error?.message}`).toBe(expected)
        }
      }
    }
    await sweep(RULES)
    await t.sql(`update duel.rules set only_on_weigh_in_day = false`)
    await sweep({ ...RULES, weighIn: { ...RULES.weighIn, onlyOnWeighInDay: false } })
  })

  it('save_weigh_in : bornes et arrondi au dixième', async () => {
    const arthus = await login(A)
    await at('2026-11-29')
    const save = (kg: number) => t.rpc(arthus, 'save_weigh_in', { p_day: '2026-11-29', p_kg: kg })
    refused(await save(RULES.weighIn.minKg - 0.1), RULE, 'Le poids doit être entre 30 et 250 kg 🤔')
    refused(await save(RULES.weighIn.maxKg + 0.1), RULE)
    ok(await save(RULES.weighIn.minKg))
    ok(await save(RULES.weighIn.maxKg))
    ok(await save(72.46))
    expect((await snap(arthus)).weighIns).toMatchObject([{ playerId: A, day: '2026-11-29', weightKg: 72.5 }])
  })

  it('set_stake accepté ⇔ isStakeEditable (et seulement pour un lundi)', async () => {
    const arthus = await login(A)
    const sweep = async (rules: Rules) => {
      for (const today of daysRange('2026-11-14', '2026-12-20')) {
        await at(today)
        for (let week = '2026-11-09'; week <= '2026-12-21'; week = addDays(week, 7)) {
          const res = await t.rpc(arthus, 'set_stake', { p_week: week, p_stake: `Gage du ${week}` })
          expect(res.error === null, `${week} vu le ${today} : ${res.error?.message}`).toBe(isStakeEditable(week, today, rules))
        }
      }
    }
    await sweep(RULES)
    await t.sql(`update duel.rules set stake_editable_days = 3`)
    await sweep({ ...RULES, stake: { ...RULES.stake, editableDays: 3 } })

    await at('2026-11-30')
    refused(await t.rpc(arthus, 'set_stake', { p_week: '2026-12-01', p_stake: 'Mardi' }), RULE, 'Une manche commence un lundi 📅')
    refused(await t.rpc(arthus, 'set_stake', { p_week: '2026-11-30', p_stake: '   ' }), RULE, 'Enjeu entre 1 et 120 caractères ✏️')
    refused(await t.rpc(arthus, 'set_stake', { p_week: '2026-11-30', p_stake: 'x'.repeat(121) }), RULE)
    ok(await t.rpc(arthus, 'set_stake', { p_week: '2026-11-30', p_stake: '  Massage  ' }))
    expect((await snap(arthus)).weeks.find((w) => w.weekStart === '2026-11-30')?.stake).toBe('Massage')
  })

  it('set_checkin : seulement ses habitudes, actives ce jour-là, avec une réponse de leur type', async () => {
    await at('2026-11-25')
    const arthus = await login(A)
    const laetitia = await login(L)
    const s = await snap(arthus)
    const ongles = habitId(s, A, 'ongles')
    const sport = habitId(s, A, 'sport')
    const set = (habit: string, value: DuelRpc['set_checkin']['args']['p_value'], uid = arthus) =>
      t.rpc(uid, 'set_checkin', { p_day: '2026-11-25', p_habit: habit, p_value: value })
    refused(await set(habitId(s, L, 'grattage'), 'nickel'), RULE, 'Habitude inconnue 🤔')
    refused(await set(ongles, 'nickel', laetitia), RULE, 'Habitude inconnue 🤔')
    refused(await set(ongles, 'fait'), RULE, 'Réponse inconnue pour cette habitude 🤔')
    refused(await set(sport, 'unpeu'), RULE, 'Réponse inconnue pour cette habitude 🤔')
    ok(await set(sport, 'pasfait'))
    ok(await set(sport, null))
    ok(await set(ongles, 'craquage'))
    expect((await snap(arthus)).checkins).toMatchObject([{ playerId: A, habitId: ongles, day: '2026-11-25', value: 'craquage' }])
    expect((await snap(arthus)).checkins[0].updatedAt).toBe(paris('2026-11-25').toISOString())

    // Une habitude acceptée ne compte qu'à partir du lundi suivant.
    const id = ok(
      await t.rpc(arthus, 'propose', { p_payload: { kind: 'habit_add', name: 'Eau', emoji: '💧', hint: '', habitKind: 'do' } }),
    ) as string
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    ok(await t.rpc(await login(L), 'answer_proposal', { p_id: id, p_accept: true }))
    const eau = (await snap(arthus)).habits.find((h) => h.name === 'Eau')!
    expect(eau.activeFrom).toBe('2026-11-30')
    refused(await set(eau.id, 'fait'), RULE, 'Cette habitude ne compte pas ce jour-là 📅')
  })
})

// ─── Propositions ──────────────────────────────────────────────────────────

describe('Propositions', () => {
  let arthus: string
  let laetitia: string
  beforeEach(async () => {
    await at('2026-12-02')
    arthus = await login(A)
    laetitia = await login(L)
  })

  const propose = async (uid: string, payload: ProposalPayload) => ok(await t.rpc(uid, 'propose', { p_payload: payload })) as string

  const statuses = async (uid: string) =>
    (await snap(uid)).proposals.map((p) => [p.authorId, p.payload.kind, p.status] as const)

  it('une nouvelle proposition remplace celle en attente sur le même sujet (même auteur)', async () => {
    const s = await snap(arthus)
    const ongles = habitId(s, A, 'ongles')
    const sport = habitId(s, A, 'sport')
    await propose(arthus, { kind: 'weigh_day', isoDay: 3 })
    await propose(laetitia, { kind: 'weigh_day', isoDay: 1 })
    await propose(arthus, { kind: 'habit_disable', habitId: ongles })
    await propose(arthus, { kind: 'habit_disable', habitId: sport })
    // Même habitude, autre kind : même sujet (R1), remplace la désactivation d'Ongles.
    await propose(arthus, { kind: 'habit_kind', habitId: ongles, habitKind: 'do' })
    await propose(arthus, { kind: 'habit_add', name: 'Eau', emoji: '💧', hint: '', habitKind: 'do' })
    await propose(arthus, { kind: 'habit_add', name: 'Sommeil', emoji: '😴', hint: '', habitKind: 'do' })
    await propose(arthus, { kind: 'goal_weight', clear: false, goalKg: 70, goalFromStartPct: null })
    // Mêmes sujets : remplacent les précédentes.
    await propose(arthus, { kind: 'weigh_day', isoDay: 5 })
    await propose(arthus, { kind: 'habit_disable', habitId: ongles })
    await propose(arthus, { kind: 'habit_add', name: '  eau ', emoji: '🚰', hint: 'Deux litres', habitKind: 'do' })
    await propose(arthus, { kind: 'goal_weight', clear: true, goalKg: null, goalFromStartPct: null })

    expect(await statuses(laetitia)).toEqual([
      [A, 'weigh_day', 'cancelled'],
      [L, 'weigh_day', 'pending'],
      [A, 'habit_disable', 'cancelled'],
      [A, 'habit_disable', 'pending'],
      [A, 'habit_kind', 'cancelled'],
      [A, 'habit_add', 'cancelled'],
      [A, 'habit_add', 'pending'],
      [A, 'goal_weight', 'cancelled'],
      [A, 'weigh_day', 'pending'],
      [A, 'habit_disable', 'pending'],
      [A, 'habit_add', 'pending'],
      [A, 'goal_weight', 'pending'],
    ])
    const last = (await snap(laetitia)).proposals.at(-2)!
    expect(last.payload).toEqual({ kind: 'habit_add', name: 'eau', emoji: '🚰', hint: 'Deux litres', habitKind: 'do' })
    expect(last.decidedAt).toBeNull()
    expect(last.effectiveFrom).toBeNull()
  })

  it('jamais acceptée d’office à la demande du téléphone, seulement si requireApproval est faux (SEC-2)', async () => {
    // L'ancien paramètre p_auto_accept n'existe plus : ni par l'API, ni en SQL direct.
    expect((await t.rpc(laetitia, 'propose', { p_payload: { kind: 'weigh_day', isoDay: 3 }, p_auto_accept: true })).error?.code).toBe('PGRST202')
    expect((await t.asRole(laetitia, `select public.propose('{"kind":"weigh_day","isoDay":3}'::jsonb, true)`)).error?.code).toBe('42883')
    const s = await snap(laetitia)
    const grignotage = habitId(s, L, 'grignotage')
    for (const payload of [
      { kind: 'habit_disable', habitId: grignotage },
      { kind: 'weigh_day', isoDay: 3 },
      { kind: 'goal_weight', clear: false, goalKg: 70, goalFromStartPct: null },
    ] satisfies ProposalPayload[]) {
      await propose(laetitia, payload)
    }
    const seen = await snap(arthus)
    expect(seen.proposals.map((p) => p.status)).toEqual(['pending', 'pending', 'pending'])
    expect(seen.settings.weighInDays).toEqual([])
    expect(seen.habits.find((h) => h.id === grignotage)?.activeUntil).toBeNull()
    expect((await kinds(0)).filter((e) => e.kind === 'proposal_accepted')).toEqual([])

    // RULES.proposals.requireApproval faux (recopié dans duel.rules) : acceptée d'office.
    await t.sql(`update duel.rules set require_approval = false`)
    const id = await propose(arthus, { kind: 'weigh_day', isoDay: 2 })
    const p = (await snap(laetitia)).proposals.find((x) => x.id === id)!
    expect(p).toMatchObject({ status: 'accepted', effectiveFrom: nextMonday('2026-12-02') })
    expect((await snap(arthus)).settings.weighInDays).toEqual([{ from: '2026-12-07', isoDay: 2 }])
  })

  it('désactivation puis changement de type d’une même habitude (deux téléphones) : rien ne rouvre une manche close (R1)', async () => {
    await at('2026-11-25')
    const phone2 = await login(A)
    const ongles = habitId(await snap(arthus), A, 'ongles')
    // Les deux téléphones d'Arthus proposent chacun quelque chose sur Ongles : un seul sujet.
    const kindId = await propose(arthus, { kind: 'habit_kind', habitId: ongles, habitKind: 'do' })
    const disableId = await propose(phone2, { kind: 'habit_disable', habitId: ongles })
    const byId = async (id: string) => (await snap(laetitia)).proposals.find((p) => p.id === id)!
    expect((await byId(kindId)).status).toBe('cancelled')
    expect((await byId(disableId)).status).toBe('pending')
    refused(await t.rpc(laetitia, 'answer_proposal', { p_id: kindId, p_accept: true }), RULE, 'Cette proposition est déjà réglée 🤷')

    // Une base d'avant ce correctif pouvait garder les deux en attente : on les y remet.
    await t.sql(`update duel.proposals set status = 'pending', decided_at = null, subject = 'habit_kind|' || $1 where id = $2`, [ongles, kindId])
    ok(await t.rpc(laetitia, 'answer_proposal', { p_id: kindId, p_accept: true }))
    const closed = (await snap(arthus)).habits.filter((h) => h.name === 'Ongles')
    expect(closed.map((h) => [h.kind, h.activeFrom, h.activeUntil])).toEqual([
      ['avoid', SEASON_START, '2026-11-30'],
      ['do', '2026-11-30', null],
    ])
    // Trois semaines plus tard, accepter la vieille désactivation : refusé, rien ne bouge.
    await at('2026-12-16')
    refused(await t.rpc(laetitia, 'answer_proposal', { p_id: disableId, p_accept: true }), RULE, 'Cette habitude est déjà désactivée 🤷')
    expect((await snap(arthus)).habits.filter((h) => h.name === 'Ongles')).toEqual(closed)
    // Même en forçant (duel.decide), l'habitude close ne bouge pas.
    await t.sql(`select duel.decide($1, true)`, [disableId])
    expect((await snap(arthus)).habits.filter((h) => h.name === 'Ongles')).toEqual(closed)
    // La refuser reste possible.
    await t.sql(`update duel.proposals set status = 'pending' where id = $1`, [disableId])
    ok(await t.rpc(laetitia, 'answer_proposal', { p_id: disableId, p_accept: false }))
    expect((await byId(disableId)).status).toBe('refused')
  })

  it('seul l’autre répond, une seule fois ; seul l’auteur annule', async () => {
    const id = await propose(arthus, { kind: 'weigh_day', isoDay: 3 })
    refused(await t.rpc(arthus, 'answer_proposal', { p_id: id, p_accept: true }), RULE, 'C’est à l’autre de répondre 😉')
    refused(await t.rpc(laetitia, 'cancel_proposal', { p_id: id }), RULE, 'Seul l’auteur peut annuler sa proposition 😉')
    ok(await t.rpc(laetitia, 'answer_proposal', { p_id: id, p_accept: false }))
    refused(await t.rpc(laetitia, 'answer_proposal', { p_id: id, p_accept: true }), RULE, 'Cette proposition est déjà réglée 🤷')
    refused(await t.rpc(arthus, 'cancel_proposal', { p_id: id }), RULE, 'Cette proposition est déjà réglée 🤷')
    expect((await snap(arthus)).settings.weighInDays).toEqual([])

    const id2 = await propose(arthus, { kind: 'weigh_day', isoDay: 4 })
    ok(await t.rpc(arthus, 'cancel_proposal', { p_id: id2 }))
    refused(await t.rpc(laetitia, 'answer_proposal', { p_id: id2, p_accept: true }), RULE, 'Cette proposition est déjà réglée 🤷')
    refused(await t.rpc(laetitia, 'answer_proposal', { p_id: SAMPLE_UUID, p_accept: true }), RULE, 'Proposition introuvable 🤔')
    expect(await statuses(arthus)).toEqual([
      [A, 'weigh_day', 'refused'],
      [A, 'weigh_day', 'cancelled'],
    ])
  })

  it('propositions invalides refusées', async () => {
    const s = await snap(arthus)
    const bad = async (payload: unknown, message?: string) =>
      refused(await t.rpc(arthus, 'propose', { p_payload: payload }), RULE, message)
    await bad({ kind: 'drop_table' }, 'Proposition inconnue 🤔')
    await bad({ kind: 'habit_disable', habitId: habitId(s, L, 'grattage') }, 'Habitude inconnue 🤔')
    await bad({ kind: 'habit_disable', habitId: 'pas-un-uuid' }, 'Habitude inconnue 🤔')
    await bad({ kind: 'habit_kind', habitId: habitId(s, A, 'ongles'), habitKind: 'maybe' }, 'Type d’habitude inconnu 🤔')
    await bad({ kind: 'habit_add', name: '', emoji: '💧', hint: '', habitKind: 'do' })
    await bad({ kind: 'habit_add', name: 'Eau', emoji: '💧', hint: 'x'.repeat(41), habitKind: 'do' })
    await bad({ kind: 'weigh_day', isoDay: 8 }, 'Jour de pesée inconnu 🤔')
    await bad({ kind: 'weigh_day', isoDay: 2.5 }, 'Jour de pesée inconnu 🤔')
    await bad({ kind: 'goal_weight', clear: false, goalKg: 12, goalFromStartPct: null }, 'Le poids doit être entre 30 et 250 kg 🤔')
    await bad({ kind: 'goal_weight', clear: false, goalKg: null, goalFromStartPct: null })

    // Une habitude déjà désactivée ne peut plus l'être.
    const ongles = habitId(s, A, 'ongles')
    ok(await t.rpc(laetitia, 'answer_proposal', { p_id: await propose(arthus, { kind: 'habit_disable', habitId: ongles }), p_accept: true }))
    await bad({ kind: 'habit_kind', habitId: ongles, habitKind: 'do' }, 'Cette habitude est déjà désactivée 🤷')
    expect((await snap(arthus)).proposals.filter((p) => p.status === 'pending')).toEqual([])
  })

  describe('effets au lundi suivant identiques à DemoSource.decide', () => {
    type Step = { payload: (habitOf: (badgeKey: string) => string) => ProposalPayload; accept: boolean }
    interface Effects {
      added: Omit<Habit, 'id'>[]
      closed: { playerId: PlayerId; name: string; kind: string; activeUntil: DayKey | null }[]
      weighInDays: WeighInDayRule[]
      goals: { playerId: PlayerId; from: DayKey; kg: number | null }[]
      proposals: { status: string; effectiveFrom: DayKey | null }[]
    }

    function diff(
      before: DuelSnapshot,
      after: DuelSnapshot,
      goalsBefore: Effects['goals'],
      goalsAfter: Effects['goals'],
    ): Effects {
      const old = new Map(before.habits.map((h) => [h.id, h]))
      const sameGoal = (a: Effects['goals'][number], b: Effects['goals'][number]) =>
        a.playerId === b.playerId && a.from === b.from && a.kg === b.kg
      return {
        added: after.habits.filter((h) => !old.has(h.id)).map(({ id: _id, ...h }) => h),
        closed: after.habits
          .filter((h) => old.has(h.id) && old.get(h.id)!.activeUntil !== h.activeUntil)
          .map((h) => ({ playerId: h.playerId, name: h.name, kind: h.kind, activeUntil: h.activeUntil })),
        weighInDays: after.settings.weighInDays.filter(
          (r) => !before.settings.weighInDays.some((b) => b.from === r.from && b.isoDay === r.isoDay),
        ),
        goals: goalsAfter.filter((g) => !goalsBefore.some((b) => sameGoal(b, g))),
        proposals: after.proposals
          .filter((p) => !before.proposals.some((b) => b.id === p.id))
          .map((p) => ({ status: p.status, effectiveFrom: p.effectiveFrom })),
      }
    }

    async function demoEffects(steps: Step[]): Promise<Effects> {
      const demo = new DemoSource({ search: '?reset=1&as=arthus', clock: () => paris('2026-12-02'), persist: false })
      const goals = () => (demo as unknown as { state: DemoState }).state.goals.map((g) => ({ ...g }))
      const before = demo.getSnapshot()
      const goalsBefore = goals()
      for (const step of steps) {
        await demo.propose(step.payload((key) => habitId(demo.getSnapshot(), A, key)))
        const p = demo.getSnapshot().proposals.filter((x) => x.authorId === A && x.status === 'pending').at(-1)!
        demo.switchPlayer(L)
        await demo.answerProposal(p.id, step.accept)
        demo.switchPlayer(A)
      }
      const after = demo.getSnapshot()
      demo.dispose()
      return diff(before, after, goalsBefore, goals())
    }

    async function sqlEffects(steps: Step[]): Promise<Effects> {
      const goals = () =>
        t.sql<Effects['goals'][number]>(
          `select player_id as "playerId", to_char(from_day, 'YYYY-MM-DD') as "from", goal_kg::float8 as kg
           from duel.goals order by player_id, from_day`,
        )
      const before = await snap(arthus)
      const goalsBefore = await goals()
      for (const step of steps) {
        const id = await propose(arthus, step.payload((key) => habitId(before, A, key)))
        ok(await t.rpc(laetitia, 'answer_proposal', { p_id: id, p_accept: step.accept }))
      }
      return diff(before, await snap(arthus), goalsBefore, await goals())
    }

    const CASES: Record<string, Step[]> = {
      habit_add: [{ payload: () => ({ kind: 'habit_add', name: 'Eau', emoji: '💧', hint: '1,5 L', habitKind: 'do' }), accept: true }],
      habit_disable: [{ payload: (h) => ({ kind: 'habit_disable', habitId: h('ongles') }), accept: true }],
      habit_kind: [{ payload: (h) => ({ kind: 'habit_kind', habitId: h('grignotage'), habitKind: 'do' }), accept: true }],
      'weigh_day (deux fois le même lundi)': [
        { payload: () => ({ kind: 'weigh_day', isoDay: 3 }), accept: true },
        { payload: () => ({ kind: 'weigh_day', isoDay: 5 }), accept: true },
      ],
      'goal_weight puis retrait': [
        { payload: () => ({ kind: 'goal_weight', clear: false, goalKg: 72.5, goalFromStartPct: null }), accept: true },
        { payload: () => ({ kind: 'goal_weight', clear: true, goalKg: null, goalFromStartPct: null }), accept: true },
      ],
      refus: [
        { payload: (h) => ({ kind: 'habit_disable', habitId: h('sport') }), accept: false },
        { payload: () => ({ kind: 'goal_weight', clear: false, goalKg: 70, goalFromStartPct: null }), accept: false },
      ],
    }

    for (const [name, steps] of Object.entries(CASES)) {
      it(name, async () => {
        const expected = await demoEffects(steps)
        const actual = await sqlEffects(steps)
        expect(actual).toEqual(expected)
        // Garde-fou : le cas produit bien quelque chose à comparer.
        expect(expected.proposals.length).toBe(steps.length)
      })
    }
  })
})

// ─── Enjeu, gages, badges, marques ─────────────────────────────────────────

describe('Enjeu, gages, badges et marques', () => {
  it('ensure_stake : idempotent entre deux téléphones, seulement pour une manche commencée', async () => {
    await at('2026-11-30', 8)
    const arthus = await login(A)
    const laetitia = await login(L)
    const drawn = drawStake(DEFAULT_GAGES, '2026-11-30')!
    const other = DEFAULT_GAGES.find((g) => g !== drawn)!
    const from = await t.lastEventId()
    expect(ok(await t.rpc(arthus, 'ensure_stake', { p_week: '2026-11-30', p_stake: drawn }))).toBe(drawn)
    expect(ok(await t.rpc(laetitia, 'ensure_stake', { p_week: '2026-11-30', p_stake: other }))).toBe(drawn)
    expect(await kinds(from)).toEqual([{ player: A, kind: 'stake', day: '2026-11-30' }])

    ok(await t.rpc(arthus, 'ensure_stake', { p_week: '2026-11-23', p_stake: ` ${DEFAULT_GAGES[0]} ` }))
    refused(await t.rpc(arthus, 'ensure_stake', { p_week: '2026-12-07', p_stake: drawn }), RULE, 'Cette manche n’a pas encore commencé ⏳')
    refused(await t.rpc(arthus, 'ensure_stake', { p_week: '2026-11-16', p_stake: drawn }), RULE)
    refused(await t.rpc(arthus, 'ensure_stake', { p_week: '2026-11-24', p_stake: drawn }), RULE, 'Une manche commence un lundi 📅')

    // Un enjeu vide compte comme absent.
    await t.sql(`update duel.weeks set stake = '  ' where week_start = '2026-11-23'`)
    expect(ok(await t.rpc(laetitia, 'ensure_stake', { p_week: '2026-11-23', p_stake: DEFAULT_GAGES[3] }))).toBe(DEFAULT_GAGES[3])
    expect((await snap(arthus)).weeks).toEqual([
      { weekStart: '2026-11-23', stake: DEFAULT_GAGES[3], gagePaid: {} },
      { weekStart: '2026-11-30', stake: drawn, gagePaid: {} },
    ])
  })

  it('ensure_stake ne pose qu’un gage de la roulette : pas de texte libre après le lundi (SEC-7)', async () => {
    await at('2026-11-26') // jeudi : l'enjeu de la manche est verrouillé, et pas encore tiré
    const laetitia = await login(L)
    const from = await t.lastEventId()
    refused(await t.rpc(laetitia, 'set_stake', { p_week: '2026-11-23', p_stake: 'Arthus fait la vaisselle un an' }), RULE, 'L’enjeu est verrouillé 🔒')
    refused(
      await t.rpc(laetitia, 'ensure_stake', { p_week: '2026-11-23', p_stake: 'Arthus fait la vaisselle un an' }),
      RULE,
      'Ce gage n’est pas dans la liste de la roulette 🎲',
    )
    expect(await kinds(from)).toEqual([])
    // Le tirage normal (un gage de la liste) passe, même un jeudi : c'est le rattrapage du lundi.
    const drawn = drawStake(DEFAULT_GAGES, '2026-11-23')!
    expect(ok(await t.rpc(laetitia, 'ensure_stake', { p_week: '2026-11-23', p_stake: drawn }))).toBe(drawn)
    // La liste change : seuls ses gages sont acceptés.
    ok(await t.rpc(laetitia, 'set_gages', { p_gages: ['Massage 💆'] }))
    await at('2026-11-30')
    refused(await t.rpc(laetitia, 'ensure_stake', { p_week: '2026-11-30', p_stake: drawn }), RULE, 'Ce gage n’est pas dans la liste de la roulette 🎲')
    expect(ok(await t.rpc(laetitia, 'ensure_stake', { p_week: '2026-11-30', p_stake: 'Massage 💆' }))).toBe('Massage 💆')
  })

  it('set_gage_paid : seul l’autre valide', async () => {
    await at('2026-11-30')
    const arthus = await login(A)
    const laetitia = await login(L)
    refused(await t.rpc(arthus, 'set_gage_paid', { p_week: '2026-11-23', p_player: A, p_paid: true }), RULE, 'C’est à l’autre de valider ton gage 😉')
    refused(await t.rpc(arthus, 'set_gage_paid', { p_week: '2026-11-23', p_player: 'bob', p_paid: true }), RULE, 'Joueur inconnu 🤔')
    ok(await t.rpc(arthus, 'set_gage_paid', { p_week: '2026-11-23', p_player: L, p_paid: true }))
    ok(await t.rpc(laetitia, 'set_gage_paid', { p_week: '2026-11-23', p_player: A, p_paid: false }))
    expect((await snap(laetitia)).weeks).toEqual([{ weekStart: '2026-11-23', stake: null, gagePaid: { [L]: true, [A]: false } }])
  })

  it('set_gages : nettoie la liste ; au moins un gage, sans limite gênante (R2)', async () => {
    const arthus = await login(A)
    ok(await t.rpc(arthus, 'set_gages', { p_gages: ['  Vaisselle ', '', '   ', 'Massage'] }))
    expect((await snap(arthus)).settings.gages).toEqual(['Vaisselle', 'Massage'])
    refused(await t.rpc(arthus, 'set_gages', { p_gages: ['  '] }), RULE, 'Il faut au moins un gage pour la roulette 🎲')
    // L'app ne limite pas le nombre de gages : 31 (ou 100) passent, le serveur garde un garde-fou très large.
    const many = (n: number) => Array.from({ length: n }, (_, i) => `Gage ${i}`)
    ok(await t.rpc(arthus, 'set_gages', { p_gages: [...DEFAULT_GAGES, ...many(23)] }))
    expect((await snap(arthus)).settings.gages).toHaveLength(31)
    ok(await t.rpc(arthus, 'set_gages', { p_gages: many(200) }))
    refused(await t.rpc(arthus, 'set_gages', { p_gages: many(201) }), RULE, /^200 gages maximum/)
    refused(await t.rpc(arthus, 'set_gages', { p_gages: ['x'.repeat(121)] }), RULE, 'Un gage fait 120 caractères maximum ✏️')
    // Même règle dans la maquette.
    const demo = new DemoSource({ search: '?reset=1&as=arthus', clock: () => paris('2026-12-02'), persist: false })
    await demo.setGages([...DEFAULT_GAGES, ...many(23)])
    expect(demo.getSnapshot().settings.gages).toHaveLength(31)
    await expect(demo.setGages(['  '])).rejects.toThrow('Il faut au moins un gage pour la roulette 🎲')
    await expect(demo.setGages(many(201))).rejects.toThrow(/^200 gages maximum/)
    demo.dispose()
  })

  it('record_badge_unlocks : idempotent (palier null compris), toujours au nom du joueur lié', async () => {
    await at('2026-12-06')
    const arthus = await login(A)
    const laetitia = await login(L)
    const unlocks = [
      { badgeId: 'zen', tier: null, day: '2026-11-29' },
      { badgeId: 'plume', tier: 2, day: '2026-11-29' },
      { badgeId: 'plume', tier: 5, day: '2026-12-06' },
    ]
    const from = await t.lastEventId()
    ok(await t.rpc(arthus, 'record_badge_unlocks', { p_unlocks: unlocks }))
    ok(await t.rpc(arthus, 'record_badge_unlocks', { p_unlocks: [...unlocks, { badgeId: 'zen', tier: null, day: '2026-12-01' }] }))
    // playerId est ignoré : on n'enregistre que les siens.
    ok(await t.rpc(arthus, 'record_badge_unlocks', { p_unlocks: [{ playerId: L, badgeId: 'machine', tier: null, day: '2026-12-01' }] }))
    expect(await kinds(from)).toEqual([
      { player: A, kind: 'badge', day: null },
      { player: A, kind: 'badge', day: null },
    ])
    const seen = (await snap(laetitia)).badgeUnlocks
    expect(seen).toEqual([
      { playerId: A, badgeId: 'plume', tier: 2, day: '2026-11-29' },
      { playerId: A, badgeId: 'zen', tier: null, day: '2026-11-29' },
      { playerId: A, badgeId: 'machine', tier: null, day: '2026-12-01' },
      { playerId: A, badgeId: 'plume', tier: 5, day: '2026-12-06' },
    ])
    refused(await t.rpc(arthus, 'record_badge_unlocks', { p_unlocks: [{ badgeId: 'zen', tier: 'or', day: '2026-12-01' }] }), RULE, 'Badge invalide 🤔')
    refused(await t.rpc(arthus, 'record_badge_unlocks', { p_unlocks: [{ badgeId: 'zen', tier: null, day: '2026-02-30' }] }), RULE)
    refused(await t.rpc(arthus, 'record_badge_unlocks', { p_unlocks: [{ badgeId: '', tier: null, day: '2026-12-01' }] }), RULE)
  })

  it('record_badge_unlocks : badges connus, paliers bornés, jours plausibles, nombre plafonné (SEC-6)', async () => {
    await at('2026-12-06')
    const laetitia = await login(L)
    const arthus = await login(A)
    const before = JSON.stringify(await snap(arthus)).length
    const bad = async (u: Record<string, unknown>) => refused(await t.rpc(laetitia, 'record_badge_unlocks', { p_unlocks: [u] }), RULE, 'Badge invalide 🤔')
    // Le palier géant de la relecture : 5,6 Ko envoyés, 13 Mo dans le snapshot de l'autre.
    const huge = Array.from({ length: 100 }, (_, i) => `{"badgeId":"plume","tier":${i + 1}e130000,"day":"2026-11-23"}`)
    const res = await t.asRole(laetitia, `select public.record_badge_unlocks($1::jsonb)`, [`[${huge.join(',')}]`])
    expect(res.error?.message).toBe('Badge invalide 🤔')
    await bad({ badgeId: 'plume', tier: 101, day: '2026-11-29' })
    await bad({ badgeId: 'plume', tier: 0, day: '2026-11-29' })
    await bad({ badgeId: 'plume', tier: 2.001, day: '2026-11-29' })
    await bad({ badgeId: 'plume', tier: null, day: '2026-11-29' })
    await bad({ badgeId: 'zen', tier: 2, day: '2026-11-29' })
    await bad({ badgeId: 'x'.repeat(64), tier: null, day: '2026-11-29' })
    await bad({ badgeId: 'trophee_inconnu', tier: null, day: '2026-11-29' })
    await bad({ badgeId: 'zen', tier: null, day: '2026-11-22' }) // avant le duel (et aucune pesée)
    await bad({ badgeId: 'zen', tier: null, day: '2026-12-08' }) // après demain
    expect(JSON.stringify(await snap(arthus)).length).toBe(before)
    // Les vrais badges passent (tous ceux de core/badges.ts), demain compris (horloge en avance).
    ok(
      await t.rpc(laetitia, 'record_badge_unlocks', {
        p_unlocks: [
          ...BADGES.map((b) => ({ badgeId: b.id, tier: b.id === 'plume' ? RULES.badges.featherTiersPct[0] : null, day: '2026-12-07' })),
          ...RULES.badges.featherTiersPct.slice(1).map((tier) => ({ badgeId: 'plume', tier, day: '2026-12-06' })),
        ],
      }),
    )
    expect((await snap(arthus)).badgeUnlocks).toHaveLength(BADGES.length + RULES.badges.featherTiersPct.length - 1)
    // Une pesée avant le début du duel peut dater un palier 🪶.
    await at('2026-11-15', 9)
    ok(await t.rpc(arthus, 'save_weigh_in', { p_day: '2026-11-15', p_kg: 80 }))
    ok(await t.rpc(arthus, 'record_badge_unlocks', { p_unlocks: [{ badgeId: 'plume', tier: 2, day: '2026-11-15' }] }))
    // Plafond : 100 badges par joueur (impossible en jouant : il y en a une douzaine).
    await t.sql(
      `insert into duel.badge_unlocks (player_id, badge_id, tier, day)
       select 'laetitia', 'plume', g::numeric / 100, '2026-12-01' from generate_series(1, 100 - $1::integer) g`,
      [BADGES.length + RULES.badges.featherTiersPct.length - 1],
    )
    await at('2026-12-06')
    refused(await t.rpc(laetitia, 'record_badge_unlocks', { p_unlocks: [{ badgeId: 'plume', tier: 99, day: '2026-12-06' }] }), RULE, 'Badge invalide 🤔')
  })

  it('mark_results_seen et mark_badges_seen : par joueur, idempotents, sans événement', async () => {
    const arthus = await login(A)
    const arthus2 = await login(A)
    const laetitia = await login(L)
    const from = await t.lastEventId()
    ok(await t.rpc(arthus, 'mark_results_seen', { p_week: '2026-11-23' }))
    ok(await t.rpc(arthus2, 'mark_results_seen', { p_week: '2026-11-23' }))
    ok(await t.rpc(arthus, 'mark_badges_seen', { p_keys: ['b', 'a', 'b'] }))
    ok(await t.rpc(arthus2, 'mark_badges_seen', { p_keys: ['a', 'c'] }))
    refused(await t.rpc(arthus, 'mark_badges_seen', { p_keys: ['x'.repeat(65)] }), RULE)
    // Vu sur un téléphone = vu sur l'autre téléphone du même joueur (décision 16).
    expect(await snap(arthus2)).toMatchObject({ seenResults: ['2026-11-23'], seenBadges: ['b', 'a', 'c'] })
    expect(await snap(laetitia)).toMatchObject({ seenResults: [], seenBadges: [] })
    expect(await t.eventsSince(from)).toEqual([])
  })

  it('profil et apparence des habitudes : immédiats, validés', async () => {
    const arthus = await login(A)
    const laetitia = await login(L)
    ok(await t.rpc(arthus, 'update_profile', { p_patch: { name: '  Arthur ', emoji: '🐼', color: '#10B981', showKg: true } }))
    expect((await snap(laetitia)).players.find((p) => p.id === A)).toMatchObject({
      name: 'Arthur', emoji: '🐼', color: '#10B981', showKg: true,
    })
    const patch = async (p: unknown, message?: string) =>
      refused(await t.rpc(arthus, 'update_profile', { p_patch: p }), RULE, message)
    await patch({ name: '' }, 'Prénom entre 1 et 24 caractères ✏️')
    await patch({ name: 'x'.repeat(25) })
    await patch({ color: 'red' }, 'Couleur invalide 🎨')
    await patch({ showKg: 'oui' }, 'Réglage inconnu 🤔')
    await patch({ meId: L }, 'Réglage inconnu 🤔')
    await patch({ emoji: '' }, 'Choisis un emoji 🙂')

    const s = await snap(arthus)
    ok(await t.rpc(arthus, 'update_habit_look', { p_habit: habitId(s, A, 'ongles'), p_patch: { name: 'Doigts', emoji: '🖐️', hint: '' } }))
    expect((await snap(laetitia)).habits.find((h) => h.id === habitId(s, A, 'ongles'))).toMatchObject({ name: 'Doigts', emoji: '🖐️', hint: '' })
    refused(await t.rpc(arthus, 'update_habit_look', { p_habit: habitId(s, L, 'grattage'), p_patch: { name: 'Hack' } }), RULE, 'Habitude inconnue 🤔')
    refused(await t.rpc(arthus, 'update_habit_look', { p_habit: habitId(s, A, 'sport'), p_patch: { kind: 'avoid' } }), RULE, 'Réglage inconnu 🤔')
  })
})

// ─── Événements ────────────────────────────────────────────────────────────

describe('Événements (public.events)', () => {
  it('checkin_done seulement au passage à complet', async () => {
    await at('2026-11-24')
    const arthus = await login(A)
    const s = await snap(arthus)
    const [ongles, grignotage, sport] = ['ongles', 'grignotage', 'sport'].map((k) => habitId(s, A, k))
    const set = (habit: string, value: DuelRpc['set_checkin']['args']['p_value'], day = '2026-11-24') =>
      t.rpc(arthus, 'set_checkin', { p_day: day, p_habit: habit, p_value: value })
    const from = await t.lastEventId()
    ok(await set(ongles, 'nickel'))
    ok(await set(grignotage, 'unpeu'))
    ok(await set(sport, 'fait')) // complet
    ok(await set(sport, 'pasfait')) // correction : déjà complet
    ok(await set(grignotage, null)) // effacé
    ok(await set(grignotage, 'craquage')) // de nouveau complet
    ok(await set(ongles, 'nickel', '2026-11-23')) // hier
    refused(await set(ongles, 'nickel', '2026-11-22')) // refusé : pas d'événement
    expect((await kinds(from)).map((e) => [e.kind, e.day])).toEqual([
      ['checkin', '2026-11-24'],
      ['checkin', '2026-11-24'],
      ['checkin_done', '2026-11-24'],
      ['checkin', '2026-11-24'],
      ['checkin', '2026-11-24'],
      ['checkin_done', '2026-11-24'],
      ['checkin', '2026-11-23'],
    ])
  })

  it('chaque action émet le bon type, au nom de son auteur', async () => {
    await at('2026-11-30')
    const from = await t.lastEventId()
    const arthus = await login(A)
    const laetitia = await login(L)
    const s = await snap(arthus)
    ok(await t.rpc(arthus, 'change_code', { p_old: CODE, p_new: '654321' }))
    ok(await t.rpc(arthus, 'update_profile', { p_patch: { emoji: '🐼' } }))
    ok(await t.rpc(arthus, 'update_habit_look', { p_habit: habitId(s, A, 'sport'), p_patch: { emoji: '🚴' } }))
    const p1 = await t.rpc(arthus, 'propose', { p_payload: { kind: 'weigh_day', isoDay: 6 } })
    ok(await t.rpc(laetitia, 'answer_proposal', { p_id: p1.data as string, p_accept: true }))
    const p2 = await t.rpc(laetitia, 'propose', { p_payload: { kind: 'weigh_day', isoDay: 2 } })
    ok(await t.rpc(arthus, 'answer_proposal', { p_id: p2.data as string, p_accept: false }))
    const p3 = await t.rpc(laetitia, 'propose', { p_payload: { kind: 'weigh_day', isoDay: 3 } })
    ok(await t.rpc(laetitia, 'cancel_proposal', { p_id: p3.data as string }))
    // Acceptée d'office (requireApproval faux) : 'proposal_accepted' au nom de l'auteur.
    await t.sql(`update duel.rules set require_approval = false`)
    ok(await t.rpc(arthus, 'propose', { p_payload: { kind: 'weigh_day', isoDay: 4 } }))
    await t.sql(`update duel.rules set require_approval = true`)
    ok(await t.rpc(laetitia, 'set_stake', { p_week: '2026-11-30', p_stake: 'Massage' }))
    ok(await t.rpc(laetitia, 'set_gages', { p_gages: ['Massage', 'Vaisselle'] }))
    ok(await t.rpc(laetitia, 'set_gage_paid', { p_week: '2026-11-23', p_player: A, p_paid: true }))
    ok(await t.rpc(laetitia, 'mark_results_seen', { p_week: '2026-11-23' }))
    ok(await t.rpc(laetitia, 'release_device', {}))
    expect(await kinds(from)).toEqual([
      { player: A, kind: 'profile', day: null },
      { player: A, kind: 'profile', day: null },
      { player: A, kind: 'proposal', day: null },
      { player: L, kind: 'proposal_accepted', day: null },
      { player: L, kind: 'proposal', day: null },
      { player: A, kind: 'proposal_refused', day: null },
      { player: L, kind: 'proposal', day: null },
      { player: L, kind: 'proposal_cancelled', day: null },
      { player: A, kind: 'proposal_accepted', day: null },
      { player: L, kind: 'stake', day: '2026-11-30' },
      { player: L, kind: 'gages', day: null },
      { player: L, kind: 'gage_paid', day: '2026-11-23' },
    ])
    // Pesée : un dimanche (jour par défaut).
    await at('2026-12-06')
    const before = await t.lastEventId()
    ok(await t.rpc(arthus, 'save_weigh_in', { p_day: '2026-12-06', p_kg: 77.7 }))
    expect(await kinds(before)).toEqual([{ player: A, kind: 'weighin', day: '2026-12-06' }])
  })
})

// ─── Données de départ et règles ───────────────────────────────────────────

describe('Données de départ et règles = src/config', () => {
  it('joueurs, habitudes et réglages égaux à defaults.ts', async () => {
    const s = await snap(await login(A))
    expect(s.players).toEqual(
      DEFAULT_PLAYERS.map((p) => ({
        id: p.key, name: p.name, emoji: p.emoji, color: p.color, showKg: false, goalKg: null, goalFromStartPct: null,
      })),
    )
    const expectedHabits = DEFAULT_PLAYERS.flatMap((p) =>
      DEFAULT_HABITS.filter((h) => h.owners.includes(p.key)).map((h, i) => ({
        playerId: p.key, name: h.name, hint: h.hint, emoji: h.emoji, kind: h.kind, badgeKey: h.badgeKey,
        activeFrom: SEASON_START, activeUntil: null, sortOrder: i,
      })),
    )
    expect(s.habits.map(({ id: _id, ...h }) => h)).toEqual(expectedHabits)
    // Identifiants au format uuid v4.
    for (const h of s.habits) expect(h.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(s.settings).toEqual({ seasonStart: SEASON_START, weighInDays: [], gages: DEFAULT_GAGES })
    expect(isoDayOf(SEASON_START)).toBe(1)
    expect(weekStartOf(SEASON_START)).toBe(SEASON_START)
    expect(s).toMatchObject({ checkins: [], weighIns: [], weeks: [], proposals: [], badgeUnlocks: [], seenResults: [], seenBadges: [] })
  })

  it('duel.rules égale RULES (et le fuseau est celui de RULES)', async () => {
    const rows = await t.sql<Record<string, unknown>>(
      `select catch_up_days, catch_up_across_weeks, only_on_weigh_in_day, default_weigh_day,
              min_kg::float8 as min_kg, max_kg::float8 as max_kg, stake_editable_days, code_max_failures, code_lock_minutes,
              require_approval, weigh_max_points::float8 as weigh_max_points,
              full_points_loss_pct::float8 as full_points_loss_pct, goal_tolerance_pct::float8 as goal_tolerance_pct
       from duel.rules`,
    )
    expect(rows).toEqual([
      {
        catch_up_days: RULES.checkin.catchUpDays,
        catch_up_across_weeks: RULES.checkin.catchUpAcrossWeeks,
        only_on_weigh_in_day: RULES.weighIn.onlyOnWeighInDay,
        default_weigh_day: RULES.weighIn.defaultDay,
        min_kg: RULES.weighIn.minKg,
        max_kg: RULES.weighIn.maxKg,
        stake_editable_days: RULES.stake.editableDays,
        code_max_failures: 10,
        code_lock_minutes: 15,
        require_approval: RULES.proposals.requireApproval,
        weigh_max_points: RULES.weighIn.maxPoints,
        full_points_loss_pct: RULES.weighIn.fullPointsLossPct,
        goal_tolerance_pct: RULES.weighIn.goalTolerancePct,
      },
    ])
    const today = await t.sql<{ src: string }>(`select prosrc as src from pg_proc where oid = 'duel.today'::regproc`)
    expect(today[0].src).toContain(`'${RULES.timezone}'`)
  })

  it('le script se relance sans rien casser ni dupliquer (et remet les règles)', async () => {
    await at('2026-11-24')
    const arthus = await login(A)
    ok(await t.rpc(arthus, 'update_profile', { p_patch: { name: 'Arthur' } }))
    ok(await t.rpc(arthus, 'set_checkin', { p_day: '2026-11-24', p_habit: habitId(await snap(arthus), A, 'ongles'), p_value: 'nickel' }))
    await t.sql(`update duel.rules set catch_up_days = 5, require_approval = false`)
    // Une base créée avec une version d'avant : l'ancien propose(jsonb, boolean) (SEC-2) et
    // l'ancien verrou par prénom seulement doivent disparaître en relançant le script.
    await t.db.exec(`create function public.propose(p_payload jsonb, p_auto_accept boolean) returns uuid
      language sql security definer set search_path = '' as $$ select null::uuid $$;
      grant execute on function public.propose(jsonb, boolean) to authenticated;
      create function duel.check_code_lock(p_player text) returns void language sql as $$ select $$;`)
    const before = await snap(arthus)
    await t.db.exec(MIGRATION_SQL)
    await t.db.exec(MIGRATION_SQL)
    await at('2026-11-24')
    expect(await snap(arthus)).toEqual(before)
    expect((await t.sql(`select catch_up_days as n, require_approval as r from duel.rules`))[0]).toEqual({
      n: RULES.checkin.catchUpDays,
      r: RULES.proposals.requireApproval,
    })
    expect((await t.eventsSince()).length).toBe(2)
    const overloads = await t.sql<{ sig: string }>(
      `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where (n.nspname = 'public' and p.proname = 'propose') or (n.nspname = 'duel' and p.proname = 'check_code_lock') order by 1`,
    )
    expect(overloads.map((o) => o.sig)).toEqual(['duel.check_code_lock(text,uuid)', 'propose(jsonb)'])
  })
})
