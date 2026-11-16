/**
 * 🧹 Tests du script « tout remettre à zéro » (supabase/remise-a-zero.sql), exécuté dans
 * PGlite par le harnais ./pglite.ts, APRÈS la vraie migration, comme dans le SQL Editor.
 *
 * Scénario de base : un duel bien rempli (check-ins, pesées, objectifs, propositions de tous
 * types acceptées et en attente, habitude ajoutée et désactivée, enjeu, gages payés, badges,
 * cérémonies vues, codes faux, journal), puis la remise à zéro. On vérifie :
 * (a) chaque table du schéma duel = une base neuve, sauf ce qui est gardé exprès (joueurs,
 *     codes, téléphones connectés, liste des gages) ;
 * (b) les téléphones restent connectés ; (c) get_snapshot renvoie un duel vide propre ;
 * (d) une autre date de début est appliquée partout ; (e) une date refusée ne change rien ;
 * (f) le script se relance sans rien casser ; (g) il n'ouvre rien à anon / authenticated ;
 * plus un garde-fou (toute table du schéma duel doit être traitée par le script) et un
 * téléphone ouvert (vraie SupabaseSource) qui se met à jour tout seul, sans toast.
 */
import { TZDate } from '@date-fns/tz'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import readme from '../../../README.md?raw'
import resetSql from '../../../supabase/remise-a-zero.sql?raw'
import { DEFAULT_HABITS, DEFAULT_PLAYERS, SEASON_START } from '../../config/defaults'
import { RULES } from '../../config/rules'
import { isoDayOf } from '../../core/dates'
import type { DayKey, DuelSnapshot, Habit, PlayerId, ProposalPayload } from '../../core/types'
import type { Activity } from '../source'
import { SQLSTATE, type EventRow, type RpcName } from './api'
import { createTestDb, MIGRATION_SQL, type RpcResult, type TestDb } from './pglite'
import { SupabaseSource, type ChannelLike, type SupabaseLike } from './SupabaseSource'

// PGlite démarre en ~3 s ; le scénario de base fait une centaine d'appels.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

/** Le script tel qu'on le colle dans le SQL Editor. */
const RESET_SQL: string = resetSql

const A: PlayerId = 'arthus'
const L: PlayerId = 'laetitia'
const CODE_A = '482916'
const CODE_L = '135790'
const NBSP = ' '
/** La liste des gages modifiée dans l'app : elle doit survivre à la remise à zéro. */
const GAGES = ['Massage des pieds 🦶', 'Vaisselle 🍽️', 'Choix du resto 🍕']

/**
 * Le sort de chaque table du schéma duel. GARDE-FOU : une nouvelle table dans 0001_duel.sql
 * fait échouer le test tant qu'elle n'est pas traitée par remise-a-zero.sql ET classée ici.
 */
const TABLES = {
  checkins: 'effacée',
  weigh_ins: 'effacée',
  goals: 'effacée',
  proposal_goals: 'effacée',
  proposals: 'effacée',
  gage_payments: 'effacée',
  weeks: 'effacée',
  seen_results: 'effacée',
  badge_unlocks: 'effacée',
  seen_badges: 'effacée',
  code_failures: 'effacée',
  weigh_days: 'effacée',
  habits: 'remise au départ',
  settings: 'remise au départ',
  players: 'gardée',
  codes: 'gardée',
  devices: 'gardée',
  rules: 'gardée',
} as const satisfies Record<string, 'effacée' | 'remise au départ' | 'gardée'>

const ERASED = Object.entries(TABLES)
  .filter(([, fate]) => fate === 'effacée')
  .map(([table]) => table)

let t: TestDb
/** Une base neuve (migration seule), jamais modifiée : la référence. */
let freshDump: Dump
/** Ce que voient Laetitia et Arthus sur une base neuve, juste après s'être connectés. */
const freshSnap = {} as Record<PlayerId, DuelSnapshot>

// ─── Horloge (serveur et téléphone) ────────────────────────────────────────

let nowMs = Date.now()
const clock = () => new Date(nowMs)

/** L'instant correspondant à une heure de Paris. */
function paris(day: DayKey, hour = 12, minute = 0): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(new TZDate(y, m - 1, d, hour, minute, 0, 0, 'Europe/Paris').getTime())
}

/** Fige l'horloge du serveur (duel.now()) et du téléphone à une heure de Paris (midi par défaut). */
async function at(day: DayKey, hour = 12, db: TestDb = t) {
  const when = paris(day, hour)
  nowMs = when.getTime()
  await db.setNow(when)
}

// ─── Petits outils ─────────────────────────────────────────────────────────

function ok<T>(res: RpcResult<T>): T {
  expect(res.error).toBeNull()
  return res.data as T
}

/** Un nouveau téléphone (session anonyme) lié à un joueur. */
async function login(player: PlayerId, code: string, db: TestDb = t): Promise<string> {
  const uid = await db.newUser()
  ok(await db.rpc(uid, 'claim_player', { p_player: player, p_code: code }))
  return uid
}

async function snap(uid: string, db: TestDb = t): Promise<DuelSnapshot> {
  return ok(await db.rpc(uid, 'get_snapshot', {}))
}

function habitId(s: DuelSnapshot, player: PlayerId, badgeKey: string): string {
  const h = s.habits.find((x) => x.playerId === player && x.badgeKey === badgeKey && x.activeUntil === null)
  if (!h) throw new Error(`habitude ${player}/${badgeKey} introuvable`)
  return h.id
}

/** La ligne à modifier dans le script (« date_de_debut … := '…'; »). */
const START_LINE = /^(\s*date_de_debut\s+constant\s+text\s*:=\s*')([^']*)(';)/m

/** Le script avec une autre date de début, comme si Arthus avait modifié la ligne. */
function withStart(value: string): string {
  return RESET_SQL.replace(START_LINE, `$1${value}$3`)
}

/** Lance le script comme le SQL Editor (tout le fichier d'un coup) : le message affiché. */
async function runReset(sql = RESET_SQL, db: TestDb = t): Promise<string> {
  const results = await db.db.exec(sql)
  const rows = results.at(-1)?.rows as { Résultat: string }[] | undefined
  expect(rows).toHaveLength(1)
  return rows![0].Résultat
}

/** Le script refusé : l'erreur (SQLSTATE et message affiché dans le SQL Editor). */
async function resetError(sql: string): Promise<{ code: string; message: string }> {
  try {
    await t.db.exec(sql)
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return { code: err.code ?? '', message: err.message ?? String(e) }
  }
  throw new Error('Le script aurait dû être refusé')
}

/** Contenu de chaque table, lignes triées : `duel.<table>` (toutes) et public.events. */
type Dump = Record<string, Record<string, unknown>[]>

async function duelTables(db: TestDb = t): Promise<string[]> {
  const rows = await db.sql<{ name: string }>(`select tablename::text as name from pg_tables where schemaname = 'duel' order by 1`)
  return rows.map((r) => r.name)
}

/**
 * Tout le contenu des tables du duel (et du journal). `stable` : sans ce qui dépend de l'heure
 * ou de l'ordre de création (habits.created_at ; id et created_at du journal), pour comparer
 * deux bases créées à des moments différents.
 */
async function dump(db: TestDb = t, { stable = false } = {}): Promise<Dump> {
  const drop: Record<string, string[]> = stable ? { 'duel.habits': ['created_at'], 'public.events': ['id', 'created_at'] } : {}
  const out: Dump = {}
  for (const name of [...(await duelTables(db)).map((n) => `duel.${n}`), 'public.events']) {
    const minus = (drop[name] ?? []).map((c) => ` - '${c}'`).join('')
    const rows = await db.sql<{ rows: Record<string, unknown>[] }>(
      `select coalesce(jsonb_agg(r.j order by r.j::text), '[]'::jsonb) as rows
       from (select to_jsonb(x)${minus} as j from ${name} x) r`,
    )
    out[name] = rows[0].rows
  }
  return out
}

/** Les joueurs tels que gardés (profil), sans objectif ni pesée. */
function keptPlayers(s: DuelSnapshot): DuelSnapshot['players'] {
  return s.players.map((p) => ({ ...p, goalKg: null, goalFromStartPct: null }))
}

/** Les habitudes de départ (defaults.ts), actives dès `start`. */
function defaultHabits(start: DayKey): Omit<Habit, 'id'>[] {
  return DEFAULT_PLAYERS.flatMap((p) =>
    DEFAULT_HABITS.filter((h) => h.owners.includes(p.key)).map((h, i) => ({
      playerId: p.key, name: h.name, hint: h.hint, emoji: h.emoji, kind: h.kind, badgeKey: h.badgeKey,
      activeFrom: start, activeUntil: null, sortOrder: i,
    })),
  )
}

// ─── Le duel bien rempli ───────────────────────────────────────────────────

interface Phones {
  arthus: string
  arthus2: string
  laetitia: string
}

/**
 * Une première manche bien remplie (semaine du lundi 23 novembre 2026). On s'arrête le mardi
 * 24 : les propositions acceptées sont déjà écrites (effet le lundi 30).
 */
async function fillDuel(): Promise<Phones> {
  // Dimanche 22 : connexions et pesée de départ.
  await at('2026-11-22', 10)
  const arthus = await login(A, CODE_A)
  const arthus2 = await login(A, CODE_A) // 2ᵉ téléphone d'Arthus
  const laetitia = await login(L, CODE_L)
  ok(await t.rpc(arthus, 'save_weigh_in', { p_day: '2026-11-22', p_kg: 82.4 }))
  ok(await t.rpc(laetitia, 'save_weigh_in', { p_day: '2026-11-22', p_kg: 64.2 }))

  // Réglages libres : profils et gages (gardés), habitude renommée (remise au départ).
  ok(await t.rpc(arthus, 'update_profile', { p_patch: { name: 'Arthur', emoji: '🐼', color: '#10B981', showKg: true } }))
  ok(await t.rpc(laetitia, 'update_profile', { p_patch: { emoji: '🦄' } }))
  ok(await t.rpc(laetitia, 'set_gages', { p_gages: GAGES }))
  const s = await snap(laetitia)
  ok(await t.rpc(laetitia, 'update_habit_look', { p_habit: habitId(s, L, 'sport'), p_patch: { name: 'Course', emoji: '🏃‍♀️', hint: '5 km' } }))

  // Lundi 23 : check-ins, enjeu, propositions de tous les types.
  await at('2026-11-23', 21)
  for (const [uid, player] of [[arthus, A], [laetitia, L]] as const) {
    for (const h of s.habits.filter((x) => x.playerId === player)) {
      ok(await t.rpc(uid, 'set_checkin', { p_day: '2026-11-23', p_habit: h.id, p_value: h.kind === 'avoid' ? 'nickel' : 'fait' }))
    }
  }
  ok(await t.rpc(arthus, 'set_stake', { p_week: '2026-11-23', p_stake: 'Massage de 15 min 💆' }))
  const accepted: [string, string, ProposalPayload][] = [
    [arthus, laetitia, { kind: 'habit_add', name: 'Eau', emoji: '💧', hint: '1,5 L', habitKind: 'do' }],
    [laetitia, arthus, { kind: 'habit_disable', habitId: habitId(s, L, 'grattage') }],
    [arthus, laetitia, { kind: 'habit_kind', habitId: habitId(s, A, 'sport'), habitKind: 'avoid' }],
    [arthus, laetitia, { kind: 'weigh_day', isoDay: 6 }],
    [laetitia, arthus, { kind: 'goal_weight', clear: false, goalKg: 60, goalFromStartPct: null }],
  ]
  for (const [author, other, payload] of accepted) {
    const id = ok(await t.rpc(author, 'propose', { p_payload: payload }))
    ok(await t.rpc(other, 'answer_proposal', { p_id: id, p_accept: true }))
  }
  // En attente (dont un objectif : kilos dans la table privée), refusée, annulée.
  ok(await t.rpc(arthus, 'propose', { p_payload: { kind: 'goal_weight', clear: false, goalKg: 78, goalFromStartPct: null } }))
  ok(await t.rpc(laetitia, 'propose', { p_payload: { kind: 'habit_add', name: 'Sucre', emoji: '🍬', hint: '', habitKind: 'avoid' } }))
  const refused = ok(await t.rpc(laetitia, 'propose', { p_payload: { kind: 'weigh_day', isoDay: 3 } }))
  ok(await t.rpc(arthus, 'answer_proposal', { p_id: refused, p_accept: false }))
  const cancelled = ok(await t.rpc(arthus, 'propose', { p_payload: { kind: 'habit_disable', habitId: habitId(s, A, 'ongles') } }))
  ok(await t.rpc(arthus, 'cancel_proposal', { p_id: cancelled }))

  // Gages payés, cérémonie vue, badges gravés et vus.
  ok(await t.rpc(laetitia, 'set_gage_paid', { p_week: '2026-11-23', p_player: A, p_paid: true }))
  ok(await t.rpc(arthus, 'set_gage_paid', { p_week: '2026-11-23', p_player: L, p_paid: false }))
  ok(await t.rpc(arthus, 'mark_results_seen', { p_week: '2026-11-23' }))
  ok(await t.rpc(laetitia, 'mark_results_seen', { p_week: '2026-11-23' }))
  ok(await t.rpc(arthus, 'record_badge_unlocks', {
    p_unlocks: [{ badgeId: 'machine', tier: null, day: '2026-11-23' }, { badgeId: 'plume', tier: 2, day: '2026-11-23' }],
  }))
  ok(await t.rpc(laetitia, 'record_badge_unlocks', { p_unlocks: [{ badgeId: 'zen', tier: null, day: '2026-11-23' }] }))
  ok(await t.rpc(arthus, 'mark_badges_seen', { p_keys: ['machine', 'plume-2'] }))

  // Mardi 24 : un check-in à moitié rempli.
  await at('2026-11-24', 9)
  ok(await t.rpc(arthus2, 'set_checkin', { p_day: '2026-11-24', p_habit: habitId(s, A, 'ongles'), p_value: 'craquage' }))

  // Codes faux d'un inconnu sur l'écran de connexion (en dernier : un bon code les efface).
  const thief = await t.newUser()
  for (let i = 0; i < 3; i++) {
    expect((await t.rpc(thief, 'claim_player', { p_player: L, p_code: '000000' })).error?.message).toBe('Code incorrect 🙅')
  }
  return { arthus, arthus2, laetitia }
}

// ─── Cycle de vie ──────────────────────────────────────────────────────────

beforeAll(async () => {
  t = await createTestDb()
  // La référence : une base neuve, puis (après la photo) ce qu'y voient les deux joueurs.
  const fresh = await createTestDb()
  freshDump = await dump(fresh, { stable: true })
  await at('2026-11-24', 12, fresh)
  freshSnap[A] = await snap(await login(A, CODE_A, fresh), fresh)
  freshSnap[L] = await snap(await login(L, CODE_L, fresh), fresh)
  await fresh.close()
})

afterAll(async () => {
  await t?.close()
})

beforeEach(async () => {
  await t.reset()
})

// ─── Le fichier lui-même ───────────────────────────────────────────────────

describe('remise-a-zero.sql : le fichier', () => {
  it('une seule ligne à modifier, dont la date par défaut est SEASON_START (un lundi)', () => {
    expect(RESET_SQL.match(new RegExp(START_LINE.source, 'gm'))).toHaveLength(1)
    expect(RESET_SQL.match(START_LINE)?.[2]).toBe(SEASON_START)
    expect(isoDayOf(SEASON_START)).toBe(1)
    // Tout le reste est dans un seul bloc (une seule transaction), suivi du message final.
    expect(RESET_SQL.match(/^do \$remise\$/gm)).toHaveLength(1)
  })

  it('garde-fou : chaque table du schéma duel est traitée par le script', async () => {
    // Une table de plus (ou de moins) dans 0001_duel.sql : l'ajouter au script ET ici.
    expect(await duelTables(), 'tables du schéma duel ≠ TABLES : mettre à jour remise-a-zero.sql').toEqual(Object.keys(TABLES).sort())
    const code = RESET_SQL.replace(/--.*$/gm, '')
    for (const [table, fate] of Object.entries(TABLES)) {
      expect(RESET_SQL, `duel.${table} doit être citée dans le script`).toMatch(new RegExp(`duel\\.${table}\\b`))
      const deleted = new RegExp(`^\\s*delete from duel\\.${table};`, 'm').test(code)
      const written = new RegExp(`(insert into|update|delete from|truncate)\\s+duel\\.${table}\\b`).test(code)
      if (fate === 'effacée') expect(deleted, `duel.${table} doit être vidée`).toBe(true)
      if (fate === 'gardée') expect(written, `duel.${table} ne doit pas être touchée`).toBe(false)
    }
    expect(code).toMatch(/^\s*delete from duel\.habits;/m)
    expect(code).toMatch(/^\s*insert into duel\.habits\b/m)
    expect(code).toMatch(/^\s*update duel\.settings set season_start = v_debut;/m)
    expect(code).toMatch(/^\s*delete from public\.events;/m)
  })

  it('la ligne de la date est bien celle que citent l’en-tête et le README (UX-4)', () => {
    const line = RESET_SQL.split('\n').findIndex((l) => START_LINE.test(l)) + 1
    expect(line).toBeGreaterThan(0)
    expect(RESET_SQL).toContain(`(vers la ligne ${line})`)
    expect(readme as string).toContain(`(vers la ligne ${line},`)
  })

  it('ne crée rien ni ne donne aucun droit (rien de nouveau à appeler)', () => {
    const code = RESET_SQL.replace(/--.*$/gm, '')
    expect(code).not.toMatch(/\b(create|grant|alter|drop|comment on|security definer)\b/i)
  })
})

// ─── Remise à zéro d'un duel bien rempli ───────────────────────────────────

describe('remise à zéro d’un duel bien rempli', () => {
  it('(a) chaque table du schéma duel = une base neuve, sauf joueurs, codes, téléphones et gages gardés', async () => {
    await fillDuel()
    const before = await dump(t, { stable: true })
    // Le scénario remplit vraiment tout ce que le script doit effacer.
    for (const table of ERASED) expect(before[`duel.${table}`].length, `duel.${table} vide avant la remise à zéro`).toBeGreaterThan(0)
    expect(before['public.events'].length).toBeGreaterThan(10)
    const habits = before['duel.habits'] as { name: string; active_until: string | null; badge_key: string | null }[]
    expect(habits.some((h) => h.name === 'Eau')).toBe(true) // ajoutée
    expect(habits.filter((h) => h.active_until !== null)).toHaveLength(2) // désactivée + type changé
    expect(habits.some((h) => h.name === 'Course')).toBe(true) // renommée
    expect(before['duel.settings']).toEqual([{ id: true, season_start: SEASON_START, gages: GAGES }])

    await runReset()
    const after = await dump(t, { stable: true })
    const { 'public.events': events, ...duel } = after
    const { 'public.events': freshEvents, ...freshDuel } = freshDump
    expect(duel).toEqual({
      ...freshDuel,
      // Gardés tels quels.
      'duel.players': before['duel.players'],
      'duel.codes': before['duel.codes'],
      'duel.devices': before['duel.devices'],
      // La liste des gages est gardée, le reste des réglages revient au départ.
      'duel.settings': freshDuel['duel.settings'].map((row) => ({ ...row, gages: GAGES })),
    })
    // Le journal ne garde que le signal « relisez le duel » (silencieux), au nom du 1er joueur.
    expect(freshEvents).toEqual([])
    expect(events).toEqual([{ player_id: L, kind: 'gages', day: null }])
    // Les habitudes sont exactement celles de la migration (identifiants compris).
    expect(duel['duel.habits']).toHaveLength(6)
  })

  it('(b) les téléphones restent connectés : personne n’a à retaper son code', async () => {
    const { arthus, arthus2, laetitia } = await fillDuel()
    await runReset()
    expect((await snap(arthus)).meId).toBe(A)
    expect((await snap(arthus2)).meId).toBe(A)
    expect((await snap(laetitia)).meId).toBe(L)
    // Ils voient le signal de relecture (temps réel, policy de public.events).
    for (const uid of [arthus, arthus2, laetitia]) {
      expect(ok(await t.asRole(uid, `select kind from public.events`))).toEqual([{ kind: 'gages' }])
    }
    // Une session non liée ne voit toujours rien.
    expect(ok(await t.asRole(await t.newUser(), `select kind from public.events`))).toEqual([])
    // Les codes n'ont pas changé, et le prénom n'est plus bloqué par les codes faux.
    expect(ok(await t.rpc(null, 'login_players', {})).map((p) => [p.id, p.hasCode])).toEqual([[L, true], [A, true]])
    expect((await t.rpc(await t.newUser(), 'claim_player', { p_player: L, p_code: '000000' })).error?.message).toBe('Code incorrect 🙅')
    expect(await t.sql(`select player_id from duel.code_failures`)).toEqual([{ player_id: L }])
    await login(L, CODE_L)
    await login(A, CODE_A)
  })

  it('(c) get_snapshot : un duel vide et propre, avec les profils et les gages gardés', async () => {
    const { arthus, laetitia } = await fillDuel()
    const kept = keptPlayers(await snap(arthus))
    expect(kept.find((p) => p.id === A)).toMatchObject({ name: 'Arthur', emoji: '🐼', color: '#10B981', showKg: true })
    await runReset()
    await at('2026-11-24', 12)
    for (const [uid, player] of [[arthus, A], [laetitia, L]] as const) {
      const s = await snap(uid)
      expect(s).toEqual({ ...freshSnap[player], players: kept, settings: { ...freshSnap[player].settings, gages: GAGES } })
      expect(s).toMatchObject({ checkins: [], weighIns: [], weeks: [], proposals: [], badgeUnlocks: [], seenResults: [], seenBadges: [] })
      expect(s.settings).toEqual({ seasonStart: SEASON_START, weighInDays: [], gages: GAGES })
      expect(s.habits.map(({ id: _id, ...h }) => h)).toEqual(defaultHabits(SEASON_START))
    }
    // Et on rejoue normalement : check-in d'aujourd'hui, pesée le dimanche (jour par défaut).
    const s = await snap(arthus)
    ok(await t.rpc(arthus, 'set_checkin', { p_day: '2026-11-24', p_habit: habitId(s, A, 'ongles'), p_value: 'nickel' }))
    await at('2026-11-29', 9)
    ok(await t.rpc(arthus, 'save_weigh_in', { p_day: '2026-11-29', p_kg: 82 }))
  })

  it('le message affiché dans le SQL Editor', async () => {
    await fillDuel()
    expect(await runReset()).toBe(
      `✅ Tout est remis à zéro${NBSP}! Le duel commence le lundi 23${NBSP}novembre 2026 ` +
        `(pesée de départ${NBSP}: dimanche 29${NBSP}novembre). ` +
        `3${NBSP}téléphones restent connectés${NBSP}: personne n’a à retaper son code.`,
    )
  })
})

// ─── La date de début ──────────────────────────────────────────────────────

describe('(d) une autre date de début est appliquée partout', () => {
  it('lundi prochain : réglages, habitudes et jour de pesée', async () => {
    const { arthus } = await fillDuel()
    const message = await runReset(withStart('2026-11-30'))
    expect(message).toContain(`le lundi 30${NBSP}novembre 2026 (pesée de départ${NBSP}: dimanche 29${NBSP}novembre)`)
    expect(await t.sql(`select season_start::text as d from duel.settings`)).toEqual([{ d: '2026-11-30' }])
    expect(await t.sql(`select distinct active_from::text as d, active_until from duel.habits`)).toEqual([{ d: '2026-11-30', active_until: null }])
    // Mêmes identifiants que la migration.
    expect((await snap(arthus)).habits.map((h) => h.id)).toEqual(freshSnap[A].habits.map((h) => h.id))
    expect((await snap(arthus)).habits.map(({ id: _id, ...h }) => h)).toEqual(defaultHabits('2026-11-30'))
    // Jour de pesée : le samedi accepté avant la remise à zéro est oublié, retour au dimanche.
    expect(await t.sql(`select count(*)::integer as n from duel.weigh_days`)).toEqual([{ n: 0 }])
    expect(await t.sql(`select duel.weigh_day_for('2026-11-30') as d`)).toEqual([{ d: RULES.weighIn.defaultDay }])
    // Le duel n'a pas commencé : pas de check-in cette semaine.
    const s = await snap(arthus)
    expect((await t.rpc(arthus, 'set_checkin', { p_day: '2026-11-24', p_habit: habitId(s, A, 'ongles'), p_value: 'nickel' })).error?.message)
      .toBe('Ce jour n’est plus modifiable 🔒')
    // Pesée de départ le dimanche 29, puis la 1re manche.
    await at('2026-11-29', 9)
    ok(await t.rpc(arthus, 'save_weigh_in', { p_day: '2026-11-29', p_kg: 82 }))
    await at('2026-11-30', 20)
    ok(await t.rpc(arthus, 'set_checkin', { p_day: '2026-11-30', p_habit: habitId(s, A, 'ongles'), p_value: 'nickel' }))
    await at('2026-12-05', 9)
    expect((await t.rpc(arthus, 'save_weigh_in', { p_day: '2026-12-05', p_kg: 81.5 })).error?.message).toBe('Ce n’est pas le jour de la pesée ⚖️')
    await at('2026-12-06', 9)
    ok(await t.rpc(arthus, 'save_weigh_in', { p_day: '2026-12-06', p_kg: 81.5 }))
  })

  it('dès ce lundi (le cas d’Arthus, le 16 novembre 2026)', async () => {
    const { arthus, laetitia } = await fillDuel()
    await at('2026-11-16', 18)
    const message = await runReset(withStart('2026-11-16'))
    // Le dimanche d'avant est passé : la pesée de départ sera la première de la manche.
    expect(message).toContain(`le lundi 16${NBSP}novembre 2026 (pesée de départ${NBSP}: dimanche 22${NBSP}novembre)`)
    const s = await snap(arthus)
    expect(s.settings).toEqual({ seasonStart: '2026-11-16', weighInDays: [], gages: GAGES })
    expect(s.habits.map(({ id: _id, ...h }) => h)).toEqual(defaultHabits('2026-11-16'))
    ok(await t.rpc(arthus, 'set_checkin', { p_day: '2026-11-16', p_habit: habitId(s, A, 'ongles'), p_value: 'nickel' }))
    expect(ok(await t.rpc(laetitia, 'ensure_stake', { p_week: '2026-11-16', p_stake: GAGES[1] }))).toBe(GAGES[1])
    await at('2026-11-22', 9)
    ok(await t.rpc(laetitia, 'save_weigh_in', { p_day: '2026-11-22', p_kg: 64 }))
  })

  it('« 1er » dans le message (lundi 1er février 2027)', async () => {
    await at('2027-01-20')
    expect(await runReset(withStart(' 2027-02-01 '))).toBe(
      `✅ Tout est remis à zéro${NBSP}! Le duel commence le lundi 1er${NBSP}février 2027 ` +
        `(pesée de départ${NBSP}: dimanche 31${NBSP}janvier). ` +
        `Aucun téléphone connecté pour l’instant${NBSP}: chacun tapera son code à la première ouverture.`,
    )
  })
})

describe('(e) une date refusée : message clair, et rien n’est changé', () => {
  const cases: [string, DayKey, string][] = [
    ['un mardi', '2026-11-24', `Le 24${NBSP}novembre 2026 est un mardi${NBSP}: il faut un lundi, par exemple 2026-11-23 (lundi 23${NBSP}novembre) ou 2026-11-30 (lundi 30${NBSP}novembre). Rien n’a été effacé.`],
    ['un dimanche', '2026-11-29', `Le 29${NBSP}novembre 2026 est un dimanche${NBSP}: il faut un lundi, par exemple 2026-11-23 (lundi 23${NBSP}novembre) ou 2026-11-30 (lundi 30${NBSP}novembre). Rien n’a été effacé.`],
    ['un mardi passé', '2026-11-10', `Le 10${NBSP}novembre 2026 est un mardi${NBSP}: il faut un lundi, par exemple 2026-11-23 (lundi 23${NBSP}novembre). Rien n’a été effacé.`],
    ['un lundi passé', '2026-11-16', `Le lundi 16${NBSP}novembre 2026 est déjà passé${NBSP}: choisis le lundi de cette semaine, 2026-11-23 (lundi 23${NBSP}novembre), ou un lundi suivant. Rien n’a été effacé.`],
    ['un 1er passé', '2026-06-01', `Le lundi 1er${NBSP}juin 2026 est déjà passé${NBSP}: choisis le lundi de cette semaine, 2026-11-23 (lundi 23${NBSP}novembre), ou un lundi suivant. Rien n’a été effacé.`],
    ['une date qui n’existe pas', '2026-11-31', `«${NBSP}2026-11-31${NBSP}» n’est pas une date${NBSP}: écris-la année-mois-jour, par exemple 2026-11-23. Rien n’a été effacé.`],
    ['une date à la française', '23/11/2026', `«${NBSP}23/11/2026${NBSP}» n’est pas une date${NBSP}: écris-la année-mois-jour, par exemple 2026-11-23. Rien n’a été effacé.`],
  ]

  it.each(cases)('%s', async (_label, value, message) => {
    await fillDuel()
    const before = await dump()
    const err = await resetError(withStart(value))
    expect(err).toEqual({ code: SQLSTATE.rule, message })
    expect(await dump()).toEqual(before)
  })

  it('les dates proposées se recopient telles quelles : le script les accepte (UX-3)', async () => {
    await at('2026-11-24', 9)
    for (const [label, value] of cases) {
      const { message } = await resetError(withStart(value))
      const proposed = [...message.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]).filter((d) => d !== value)
      expect(proposed.length, label).toBeGreaterThan(0)
      // Jamais de JJ/MM/AAAA proposé (hors la valeur refusée, citée) : le script le refuse.
      expect(message.replaceAll(value, ''), label).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
      for (const day of proposed) expect(await runReset(withStart(day)), `${label} → ${day}`).toMatch(/^✅ Tout est remis à zéro/)
    }
  })

  it('messages en typographie française (insécables, apostrophes courbes)', () => {
    for (const [, , message] of cases) {
      expect(message).not.toMatch(/ [:;!?»]/)
      expect(message).not.toContain("'")
    }
  })

  it('script principal pas encore lancé : on le dit, sans rien toucher', async () => {
    const empty = new PGlite()
    try {
      await expect(empty.exec(RESET_SQL)).rejects.toThrow(
        'Lance d’abord le script supabase/migrations/0001_duel.sql (étape 2 du README), puis celui-ci. Rien n’a été effacé.',
      )
    } finally {
      await empty.close()
    }
  })
})

// ─── Relancer ──────────────────────────────────────────────────────────────

describe('(f) relancer ne casse rien', () => {
  it('deux fois de suite : le même duel propre, toujours connectés', async () => {
    const { arthus, laetitia } = await fillDuel()
    await runReset()
    const once = await dump(t, { stable: true })
    const snapOnce = await snap(arthus)
    await runReset()
    expect(await dump(t, { stable: true })).toEqual(once)
    expect(await snap(arthus)).toEqual(snapOnce)
    expect((await snap(laetitia)).meId).toBe(L)
    expect((await t.eventsSince()).map((e) => e.kind)).toEqual(['gages'])
  })

  it('relancer ensuite 0001_duel.sql ne change rien non plus', async () => {
    const { arthus } = await fillDuel()
    await runReset()
    const reset = await dump(t, { stable: true })
    const snapReset = await snap(arthus)
    await t.db.exec(MIGRATION_SQL)
    expect(await dump(t, { stable: true })).toEqual(reset)
    expect(await snap(arthus)).toEqual(snapReset)
  })
})

// ─── Sécurité ──────────────────────────────────────────────────────────────

describe('(g) rien de nouveau pour anon / authenticated', () => {
  /** Tout ce qui décide de qui peut appeler ou lire quoi. */
  async function catalog() {
    return {
      functions: await t.sql(
        `select n.nspname || '.' || p.oid::regprocedure::text as sig, coalesce(p.proacl::text, '') as acl, p.prosecdef as definer,
                has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname not in ('pg_catalog', 'information_schema') order by 1`,
      ),
      relations: await t.sql(
        `select c.oid::regclass::text as name, c.relkind::text as kind, coalesce(c.relacl::text, '') as acl,
                c.relrowsecurity as rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast') order by 1`,
      ),
      schemas: await t.sql(`select nspname::text as name, coalesce(nspacl::text, '') as acl from pg_namespace order by 1`),
      policies: await t.sql(`select schemaname::text, tablename::text, policyname::text, roles::text, cmd, qual from pg_policies order by 1, 2, 3`),
      publication: await t.sql(`select pubname::text, schemaname::text, tablename::text from pg_publication_tables order by 1, 2, 3`),
      defaults: await t.sql(`select coalesce(defaclacl::text, '') as acl from pg_default_acl order by 1`),
    }
  }

  it('mêmes fonctions, tables, droits et règles d’accès avant et après', async () => {
    await fillDuel()
    const before = await catalog()
    await runReset()
    await runReset(withStart('2026-11-30'))
    expect(await catalog()).toEqual(before)
  })

  it('un téléphone (authenticated ou anon) ne peut pas lancer le script', async () => {
    const { arthus } = await fillDuel()
    const before = await dump()
    for (const uid of [arthus, null]) {
      const role = uid ? 'authenticated' : 'anon'
      const run = t.db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid ?? '', role })])
        await tx.exec(`set local role ${role}`)
        await tx.exec(RESET_SQL)
      })
      await expect(run).rejects.toMatchObject({ code: '42501' })
    }
    expect(await dump()).toEqual(before)
    // Et rien de tel parmi les fonctions RPC.
    for (const name of ['remise_a_zero', 'reset', 'reset_duel']) {
      expect((await t.rpc(arthus, name, {})).error?.code).toBe('PGRST202')
    }
  })
})

// ─── Un téléphone ouvert pendant la remise à zéro ──────────────────────────

/** Ce que Realtime met dans payload.new (date → 'YYYY-MM-DD', int8 → nombre). */
const EVENTS_AS_SUBSCRIBER = `
  select id::integer as id, player_id, kind, to_char(day, 'YYYY-MM-DD') as day,
         to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
  from public.events where id > $1 order by id`

/**
 * Un téléphone déjà connecté, app ouverte : la vraie SupabaseSource sur un faux client branché
 * sur la base PGlite (en plus simple que contract.test.ts). Le temps réel est livré à la main
 * (deliverEvents), lu EN TANT QUE la session du téléphone, comme Realtime (RLS).
 */
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

describe('les téléphones ouverts se mettent à jour', () => {
  it('relecture immédiate par le temps réel, sans toast trompeur', async () => {
    const { arthus } = await fillDuel()
    await at('2026-11-24', 20)
    const phone = new OpenPhone(arthus)
    const src = new SupabaseSource({ client: phone, clock })
    const toasts: Activity[] = []
    src.subscribe((_s, activity) => {
      if (activity) toasts.push(activity)
    })
    try {
      await vi.waitFor(() => expect(src.signedIn && !src.loading && phone.subscribed).toBe(true), { timeout: 10_000 })
      await vi.waitFor(() => expect(src.getSnapshot().checkins.length).toBeGreaterThan(0), { timeout: 10_000 })
      expect(src.getSnapshot().settings.gages).toEqual(GAGES)

      // Laetitia ne fait rien : la remise à zéro est faite dans le SQL Editor (au nom du 1er joueur).
      await runReset(withStart('2026-11-30'))
      expect((await phone.deliverEvents()).map((e) => [e.player_id, e.kind])).toEqual([[L, 'gages']])
      await vi.waitFor(() => expect(src.getSnapshot().checkins).toEqual([]), { timeout: 10_000 })
      expect(src.getSnapshot()).toEqual(await snap(arthus))
      expect(src.getSnapshot().settings.seasonStart).toBe('2026-11-30')
      // Pas de « 👀 Laetitia vient de… » : elle n'a rien fait.
      expect(toasts).toEqual([])
    } finally {
      src.dispose()
    }
  })

  it('remise à zéro sur la manche en cours, apps ouvertes : l’enjeu est tiré à nouveau (F3)', async () => {
    // Le duel a commencé ce lundi 16 ; mardi 17, les deux apps ouvertes ont tiré l'enjeu.
    await at('2026-11-16', 9)
    await runReset(withStart('2026-11-16'))
    await at('2026-11-17', 9)
    const phones = [new OpenPhone(await login(A, CODE_A)), new OpenPhone(await login(L, CODE_L))]
    const sources = phones.map((client) => new SupabaseSource({ client, clock }))
    const toasts: Activity[] = []
    for (const src of sources) {
      src.subscribe((_s, activity) => {
        if (activity) toasts.push(activity)
      })
    }
    const stakeOf = (src: SupabaseSource) => src.getSnapshot().weeks.find((w) => w.weekStart === '2026-11-16')?.stake ?? null
    const serverStakes = async () =>
      (await t.sql<{ n: number }>(`select count(*)::int as n from duel.weeks where week_start = '2026-11-16' and stake is not null`))[0].n
    try {
      for (const src of sources) await vi.waitFor(() => expect(stakeOf(src)).toBeTruthy(), { timeout: 10_000 })
      await vi.waitFor(() => expect(phones.every((p) => p.subscribed)).toBe(true), { timeout: 10_000 })
      const drawn = stakeOf(sources[0])

      // Remise à zéro dans le SQL Editor, même date : l'enjeu est effacé…
      await runReset(withStart('2026-11-16'))
      expect(await serverStakes()).toBe(0)
      for (const p of phones) await p.deliverEvents()

      // … et une app restée ouverte le tire à nouveau (le même : drawStake est déterministe).
      await vi.waitFor(async () => expect(await serverStakes()).toBe(1), { timeout: 10_000 })
      for (const p of phones) await p.deliverEvents()
      for (const src of sources) await vi.waitFor(() => expect(stakeOf(src)).toBe(drawn), { timeout: 10_000 })
      expect(sources[0].getSnapshot().checkins).toEqual([])
      // Le tirage automatique ne fait pas de toast.
      expect(toasts).toEqual([])
    } finally {
      for (const src of sources) src.dispose()
    }
  })
})
