/**
 * 🧪 Harnais de test : un « faux Supabase » dans PGlite (Postgres compilé en WASM).
 *
 * Il exécute la VRAIE migration (supabase/migrations/0001_duel.sql) dans une base qui imite
 * ce que Supabase fournit : rôles anon / authenticated / service_role, schémas auth et
 * extensions, pgcrypto, table auth.users, auth.uid() (lue dans les claims du JWT comme sur
 * Supabase), droits par défaut du schéma public (tout y est ouvert à anon et authenticated :
 * la migration doit donc tout refermer elle-même) et publication supabase_realtime.
 *
 * Les appels imitent PostgREST + supabase-js : `rpc()` appelle la fonction EN TANT QUE le
 * rôle authenticated (ou anon sans session), dans une transaction, avec les arguments
 * nommés convertis aux types déclarés de la fonction, et renvoie { data, error } comme
 * supabase.rpc(). Réservé aux tests (Vitest) : rien ici n'est importé par l'app.
 *
 * Exemple :
 *   const t = await createTestDb()
 *   const uid = await t.newUser()
 *   await t.rpc(uid, 'claim_player', { p_player: 'arthus', p_code: '123456' })
 *   const { data } = await t.rpc(uid, 'get_snapshot', {})
 */
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import migrationSql from '../../../supabase/migrations/0001_duel.sql?raw'
import type { DuelRpc, EventRow, RpcName } from './api'

/** Le script SQL de la migration, tel qu'on le colle dans Supabase. */
export const MIGRATION_SQL: string = migrationSql

/** Ce que Supabase fournit avant qu'on lance la migration. */
export const SUPABASE_SIM_SQL = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;

create table if not exists auth.users (
  id           uuid primary key,
  is_anonymous boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Comme sur Supabase : l'identifiant de l'utilisateur vient des claims du JWT.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  ), '')
$$;

-- Droits par défaut de Supabase : ce qu'on crée dans public est ouvert à anon et authenticated.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
`

/** Erreur au format PostgREST / supabase-js. */
export interface RpcError {
  code: string
  message: string
  details: string | null
  hint: string | null
}

/** Réponse au format supabase-js : `data` ou `error`. */
export interface RpcResult<T> {
  data: T | null
  error: RpcError | null
}

export interface TestDb {
  /** La base PGlite (en superutilisateur : pour préparer ou inspecter les données). */
  readonly db: PGlite
  /** Requête en superutilisateur (contourne tout). */
  sql<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>
  /** Un nouvel utilisateur (session anonyme de Supabase) : son uuid. */
  newUser(opts?: { anonymous?: boolean }): Promise<string>
  /**
   * Appelle une fonction RPC comme supabase.rpc(name, args), avec la session `uid`
   * (rôle authenticated) ou sans session (null : rôle anon).
   */
  rpc<N extends RpcName>(uid: string | null, name: N, args: DuelRpc[N]['args']): Promise<RpcResult<DuelRpc[N]['returns']>>
  /** Variante sans types (arguments invalides, fonctions inexistantes…). */
  rpc(uid: string | null, name: string, args?: Record<string, unknown>): Promise<RpcResult<unknown>>
  /** Exécute du SQL en tant que authenticated (session `uid`) ou anon (null) : accès direct. */
  asRole<T = Record<string, unknown>>(uid: string | null, query: string, params?: unknown[]): Promise<RpcResult<T[]>>
  /** Fige l'horloge du serveur (duel.now()) ; null = horloge réelle. */
  setNow(at: string | Date | null): Promise<void>
  /** Les événements de public.events d'id > `afterId` (lus en superutilisateur). */
  eventsSince(afterId?: number): Promise<EventRow[]>
  /** Dernier id de public.events (0 si vide). */
  lastEventId(): Promise<number>
  /** Repart de zéro : vide toutes les données puis relance la migration (horloge réelle). */
  reset(): Promise<void>
  close(): Promise<void>
}

interface FnInfo {
  argNames: string[]
  argTypes: string[]
  returnType: string
}

/** Construit la base modèle une seule fois par fichier de test, puis la clone (plus rapide). */
let template: Promise<PGlite> | null = null

async function buildTemplate(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_SIM_SQL)
  await db.exec(MIGRATION_SQL)
  return db
}

/** Une base neuve : Supabase simulé + migration + données de départ. */
export async function createTestDb(): Promise<TestDb> {
  template ??= buildTemplate()
  const db = (await (await template).clone()) as PGlite
  return wrap(db)
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function toRpcError(e: unknown): RpcError {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string }
  return {
    code: err.code ?? '',
    message: err.message ?? String(e),
    details: err.detail ?? null,
    hint: err.hint ?? null,
  }
}

function wrap(db: PGlite): TestDb {
  const fnCache = new Map<string, FnInfo>()

  async function fnInfo(name: string): Promise<FnInfo | null> {
    const cached = fnCache.get(name)
    if (cached) return cached
    const res = await db.query<{ arg_names: string[] | null; arg_types: string[] | null; return_type: string }>(
      `select p.proargnames as arg_names,
              (select array_agg(format_type(t, null) order by i)
                 from unnest(p.proargtypes::oid[]) with ordinality as a(t, i)) as arg_types,
              format_type(p.prorettype, null) as return_type
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = $1`,
      [name],
    )
    if (res.rows.length !== 1) return null
    const row = res.rows[0]
    const info: FnInfo = { argNames: row.arg_names ?? [], argTypes: row.arg_types ?? [], returnType: row.return_type }
    fnCache.set(name, info)
    return info
  }

  /** Comme PostgREST : rôle et claims du JWT, locaux à la transaction. */
  async function impersonate(tx: Transaction, uid: string | null) {
    const role = uid ? 'authenticated' : 'anon'
    const claims = uid ? { sub: uid, role, is_anonymous: true } : { role }
    await tx.query(
      `select set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', $3, true)`,
      [JSON.stringify(claims), uid ?? '', role],
    )
    await tx.exec(`set local role ${role}`)
  }

  async function rpc(uid: string | null, name: string, args: Record<string, unknown> = {}): Promise<RpcResult<unknown>> {
    const info = await fnInfo(name)
    const given = Object.keys(args).filter((k) => args[k] !== undefined)
    const sameArgs =
      info !== null && given.length === info.argNames.length && given.every((k) => info.argNames.includes(k))
    if (!info || !sameArgs) {
      // Ce que répond PostgREST quand la fonction (avec ces arguments) n'existe pas.
      return {
        data: null,
        error: {
          code: 'PGRST202',
          message: `Could not find the function public.${name}(${given.join(', ')}) in the schema cache`,
          details: null,
          hint: null,
        },
      }
    }
    // Comme PostgREST : les arguments arrivent en JSON et sont convertis aux types déclarés.
    const call =
      info.argNames.length === 0
        ? `select public.${quoteIdent(name)}() as result`
        : `select public.${quoteIdent(name)}(${info.argNames.map((a) => `${quoteIdent(a)} => args.${quoteIdent(a)}`).join(', ')}) as result
           from json_to_record($1::json) as args(${info.argNames.map((a, i) => `${quoteIdent(a)} ${info.argTypes[i]}`).join(', ')})`
    try {
      return await db.transaction(async (tx) => {
        await impersonate(tx, uid)
        const res = await tx.query<{ result: unknown }>(call, info.argNames.length === 0 ? [] : [JSON.stringify(args)])
        const status = await tx.query<{ status: string | null }>(`select current_setting('response.status', true) as status`)
        const result = res.rows[0]?.result ?? null
        // Statut HTTP posé par la fonction (ex. code faux) : la transaction est validée,
        // et supabase-js lit le corps comme une erreur.
        if (Number(status.rows[0]?.status) >= 400) {
          const body = (result ?? {}) as Partial<RpcError>
          return {
            data: null,
            error: { code: body.code ?? '', message: body.message ?? '', details: body.details ?? null, hint: body.hint ?? null },
          }
        }
        return { data: info.returnType === 'void' ? null : result, error: null }
      })
    } catch (e) {
      return { data: null, error: toRpcError(e) }
    }
  }

  async function asRole<T>(uid: string | null, query: string, params: unknown[] = []): Promise<RpcResult<T[]>> {
    try {
      return await db.transaction(async (tx) => {
        await impersonate(tx, uid)
        const res = await tx.query<T>(query, params)
        return { data: res.rows, error: null }
      })
    } catch (e) {
      return { data: null, error: toRpcError(e) }
    }
  }

  async function sql<T>(query: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(query, params)).rows
  }

  async function setNow(at: string | Date | null): Promise<void> {
    const body = at === null ? 'select pg_catalog.now()' : `select '${new Date(at).toISOString()}'::timestamptz`
    await db.exec(`create or replace function duel.now() returns timestamptz
      language sql stable set search_path = '' as $$ ${body} $$`)
  }

  async function eventsSince(afterId = 0): Promise<EventRow[]> {
    return sql<EventRow>(
      `select id::integer as id, player_id, kind, to_char(day, 'YYYY-MM-DD') as day,
              to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
       from public.events where id > $1 order by id`,
      [afterId],
    )
  }

  async function lastEventId(): Promise<number> {
    const rows = await sql<{ id: number }>(`select coalesce(max(id), 0)::integer as id from public.events`)
    return rows[0].id
  }

  async function newUser(opts: { anonymous?: boolean } = {}): Promise<string> {
    const rows = await sql<{ id: string }>(
      `insert into auth.users (id, is_anonymous) values (gen_random_uuid(), $1) returning id::text as id`,
      [opts.anonymous ?? true],
    )
    return rows[0].id
  }

  async function reset(): Promise<void> {
    await db.exec(`truncate duel.players, duel.settings, duel.rules, duel.weigh_days, duel.weeks, auth.users,
      public.events restart identity cascade`)
    await db.exec(MIGRATION_SQL)
  }

  return {
    db,
    sql,
    newUser,
    rpc: rpc as TestDb['rpc'],
    asRole,
    setNow,
    eventsSince,
    lastEventId,
    reset,
    close: () => db.close(),
  }
}
