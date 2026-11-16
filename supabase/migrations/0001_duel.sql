-- ════════════════════════════════════════════════════════════════════════════
-- 🥊 Duel des Défauts — la base Supabase
-- ════════════════════════════════════════════════════════════════════════════
--
-- À quoi sert ce script ?
--   Il crée tout ce dont l'app a besoin dans Supabase :
--   - les tables du duel (schéma `duel`, que l'API n'expose pas : personne ne peut les lire
--     ni les modifier directement depuis un téléphone) ;
--   - les fonctions appelées par l'app (schéma `public`) : connexion par prénom + code,
--     lecture du duel, check-in, pesée, propositions, enjeu… Elles vérifient qui joue,
--     appliquent les règles du jeu et masquent les kilos de l'autre ;
--   - le journal `public.events`, qui sert au temps réel (« 👀 Laetitia vient de faire son
--     check-in ») sans rien contenir de privé ;
--   - les données de départ : Laetitia, Arthus, leurs habitudes, la liste des gages.
--   Contrat avec l'app : src/data/supabase/api.ts. Règles du jeu : src/config/rules.ts.
--
-- Comment le lancer ?
--   1. Supabase › ton projet › SQL Editor › « New query ».
--   2. Colle TOUT ce fichier, puis « Run ». Résultat attendu : « Success. No rows returned ».
--   3. Authentication › Sign In / Providers : active « Allow anonymous sign-ins ».
--      (Chaque téléphone ouvre une session anonyme, puis la lie à un joueur avec son code.)
--   4. Conseillé : posez tout de suite vos deux codes (voir « Petits dépannages » plus bas),
--      sinon le premier code tapé pour un prénom devient le sien.
--
-- On peut le relancer sans risque (après une mise à jour du fichier, par exemple) : il ne
-- casse rien et n'efface aucune donnée. Les données de départ ne sont créées qu'une fois ;
-- seule la table des règles (duel.rules) est recopiée à chaque fois depuis ce fichier.
--
-- Petits dépannages (à lancer dans le SQL Editor) :
--   - Code oublié (ou vu par quelqu'un) : select duel.reset_code('arthus', '482916');
--     → ce code (6 chiffres, à choisir) devient le sien, et TOUS ses téléphones sont
--     déconnectés : chacun devra taper le nouveau code.
--   - Poser les codes à l'avance (plus sûr que « le premier code tapé ») : la même ligne,
--     pour 'laetitia' et pour 'arthus', juste après avoir lancé ce script.
--   - Trop d'essais : delete from duel.code_failures where player_id = 'laetitia';
--     (ou, depuis un téléphone déjà connecté : Réglages › Mon compte › Débloquer mon prénom).
--   - Changer la date de début AVANT la première manche (un lundi) :
--       update duel.settings set season_start = '2026-11-30';
--       update duel.habits set active_from = '2026-11-30' where active_from = '2026-11-23';
--
-- Règles de parité : chaque règle du jeu recopiée ici reproduit EXACTEMENT le code
-- TypeScript cité en commentaire (src/core/…). Les tests src/data/supabase/sql.test.ts
-- le vérifient en faisant tourner ce fichier dans un Postgres de test (PGlite).
-- Compatible Postgres 15 et plus.
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
-- 0. Extension et schéma
-- ────────────────────────────────────────────────────────────────────────────

-- bcrypt pour les codes (déjà installé dans le schéma `extensions` sur Supabase).
create extension if not exists pgcrypto with schema extensions;

-- Les tables vivent ici. Ce schéma n'est PAS exposé par l'API (Settings › Data API ›
-- Exposed schemas : ne surtout pas y ajouter `duel`) et aucun droit n'y est donné (section 6).
create schema if not exists duel;

-- L'horloge du serveur. Les tests la remplacent pour voyager dans le temps.
create or replace function duel.now() returns timestamptz
language sql stable set search_path = '' as $$ select pg_catalog.now() $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Tables du duel (schéma `duel`)
-- ────────────────────────────────────────────────────────────────────────────

-- Les deux joueurs (id = 'laetitia' / 'arthus', comme src/config/defaults.ts).
create table if not exists duel.players (
  id         text primary key,
  sort_order integer not null,
  name       text not null,
  emoji      text not null,
  color      text not null,
  -- « Montrer mes kilos à l'autre ».
  show_kg    boolean not null default false
);

-- Le code secret de chaque joueur (hash bcrypt, jamais le code lui-même).
create table if not exists duel.codes (
  player_id  text primary key references duel.players (id) on delete cascade,
  code_hash  text not null,
  updated_at timestamptz not null default duel.now()
);

-- Les téléphones connectés : une session anonyme Supabase → un joueur.
create table if not exists duel.devices (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  player_id text not null references duel.players (id) on delete cascade,
  linked_at timestamptz not null default duel.now()
);
create index if not exists devices_player_idx on duel.devices (player_id);

-- Les codes faux, pour le verrou (code_max_failures échecs en code_lock_minutes).
create table if not exists duel.code_failures (
  id        bigint generated always as identity primary key,
  player_id text not null references duel.players (id) on delete cascade,
  failed_at timestamptz not null default duel.now()
);
-- La session qui s'est trompée : changer son code (téléphone déjà connecté) ne compte que
-- SES erreurs, pas celles d'un inconnu qui essaie des codes sur l'écran de connexion.
alter table duel.code_failures add column if not exists user_id uuid;
create index if not exists code_failures_player_idx on duel.code_failures (player_id, failed_at);

-- Les habitudes (chaque joueur a ses propres copies, décision 9).
create table if not exists duel.habits (
  id           uuid primary key default gen_random_uuid(),
  player_id    text not null references duel.players (id) on delete cascade,
  name         text not null,
  hint         text not null default '',
  emoji        text not null,
  kind         text not null check (kind in ('avoid', 'do')),
  badge_key    text check (badge_key in ('ongles', 'grattage', 'grignotage', 'sport')),
  -- Premier jour où elle compte (inclus) / premier jour où elle ne compte plus (exclu).
  active_from  date not null,
  active_until date,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default duel.now()
);
create index if not exists habits_player_idx on duel.habits (player_id);

-- Un seul check-in par joueur, habitude et jour.
create table if not exists duel.checkins (
  player_id  text not null references duel.players (id) on delete cascade,
  habit_id   uuid not null references duel.habits (id) on delete cascade,
  day        date not null,
  value      text not null check (value in ('nickel', 'unpeu', 'craquage', 'fait', 'pasfait')),
  updated_at timestamptz not null default duel.now(),
  primary key (player_id, habit_id, day)
);

-- Les pesées, en kg au dixième (seules les fonctions les lisent : l'autre ne voit que des %).
create table if not exists duel.weigh_ins (
  player_id  text not null references duel.players (id) on delete cascade,
  day        date not null,
  kg         numeric(5,1) not null check (kg > 0),
  updated_at timestamptz not null default duel.now(),
  primary key (player_id, day)
);

-- Historique des poids objectifs (privés) : le plus récent applicable gagne.
create table if not exists duel.goals (
  player_id text not null references duel.players (id) on delete cascade,
  from_day  date not null,
  -- null = objectif retiré à partir de ce jour.
  goal_kg   numeric(5,1),
  primary key (player_id, from_day)
);

-- Les manches : enjeu (gage de la semaine).
create table if not exists duel.weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  stake      text,
  updated_at timestamptz not null default duel.now()
);

-- « Gage payé ✅ » (validé par l'autre joueur).
create table if not exists duel.gage_payments (
  week_start date not null references duel.weeks (week_start) on delete cascade,
  player_id  text not null references duel.players (id) on delete cascade,
  paid       boolean not null,
  updated_at timestamptz not null default duel.now(),
  primary key (week_start, player_id)
);

-- Réglages communs (une seule ligne).
create table if not exists duel.settings (
  id           boolean primary key default true check (id),
  -- Lundi de la première manche (SEASON_START de src/config/defaults.ts).
  season_start date not null,
  -- Liste des gages de la roulette 🎲.
  gages        text[] not null default '{}'
);

-- Jour de la pesée (1 = lundi … 7 = dimanche) à partir d'un lundi. Vide = rules.default_weigh_day.
create table if not exists duel.weigh_days (
  from_day date primary key,
  iso_day  integer not null check (iso_day between 1 and 7)
);

-- Les propositions de changement de règles (décision 2). Le payload ne contient JAMAIS de kilos.
create table if not exists duel.proposals (
  id             uuid primary key default gen_random_uuid(),
  -- Ordre de création (plusieurs propositions peuvent naître dans la même transaction).
  seq            bigint generated always as identity,
  author_id      text not null references duel.players (id) on delete cascade,
  kind           text not null check (kind in ('habit_add', 'habit_disable', 'habit_kind', 'weigh_day', 'goal_weight')),
  -- Sujet : une nouvelle proposition remplace celle en attente sur le même sujet (décision 17).
  subject        text not null,
  payload        jsonb not null check (jsonb_typeof(payload) = 'object' and not payload ? 'goalKg'),
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'refused', 'cancelled')),
  created_at     timestamptz not null default duel.now(),
  decided_at     timestamptz,
  effective_from date
);
create index if not exists proposals_pending_idx on duel.proposals (author_id, subject) where status = 'pending';

-- Les kilos des propositions d'objectif (privés : jamais dans le payload).
create table if not exists duel.proposal_goals (
  proposal_id uuid primary key references duel.proposals (id) on delete cascade,
  goal_kg     numeric(5,1)
);

-- Cérémonies de fin de manche déjà vues, par joueur.
create table if not exists duel.seen_results (
  player_id  text not null references duel.players (id) on delete cascade,
  week_start date not null,
  primary key (player_id, week_start)
);

-- Badges débloqués (un badge débloqué le reste, décision 16). Palier null = badge sans palier :
-- « nulls not distinct » (Postgres 15+) pour qu'il ne soit enregistré qu'une fois lui aussi.
create table if not exists duel.badge_unlocks (
  id        bigint generated always as identity primary key,
  player_id text not null references duel.players (id) on delete cascade,
  badge_id  text not null,
  tier      numeric,
  day       date not null,
  constraint badge_unlocks_once unique nulls not distinct (player_id, badge_id, tier)
);

-- Célébrations de badges déjà vues, par joueur.
create table if not exists duel.seen_badges (
  player_id text not null references duel.players (id) on delete cascade,
  seen_key  text not null,
  seq       bigint generated always as identity,
  primary key (player_id, seen_key)
);

-- Les règles du jeu utiles au serveur (une seule ligne), recopiées de src/config/rules.ts
-- (section 7). Un test vérifie qu'elles sont égales à RULES.
create table if not exists duel.rules (
  id                    boolean primary key default true check (id),
  -- RULES.checkin.catchUpDays / catchUpAcrossWeeks
  catch_up_days         integer not null,
  catch_up_across_weeks boolean not null,
  -- RULES.weighIn.onlyOnWeighInDay / defaultDay / minKg / maxKg
  only_on_weigh_in_day  boolean not null,
  default_weigh_day     integer not null check (default_weigh_day between 1 and 7),
  min_kg                numeric not null,
  max_kg                numeric not null,
  -- RULES.stake.editableDays
  stake_editable_days   integer not null,
  -- Verrou des codes (décision 20) : code_max_failures codes faux en code_lock_minutes.
  code_max_failures     integer not null,
  code_lock_minutes     integer not null
);
-- Colonnes ajoutées ensuite (une base déjà créée les reçoit en relançant le script ; les
-- valeurs sont recopiées de RULES en section 7) :
-- RULES.proposals.requireApproval (faux = proposition acceptée d'office).
alter table duel.rules add column if not exists require_approval boolean not null default true;
-- RULES.weighIn.maxPoints / fullPointsLossPct / goalTolerancePct : pour arrondir les % de
-- l'autre sans changer ses points de pesée (section 3, « Ce que l'autre voit »).
alter table duel.rules add column if not exists weigh_max_points numeric not null default 100;
alter table duel.rules add column if not exists full_points_loss_pct numeric not null default 1;
alter table duel.rules add column if not exists goal_tolerance_pct numeric not null default 1;

-- RLS partout, AUCUNE règle d'accès : défense en profondeur (on ne passe que par les fonctions).
alter table duel.players       enable row level security;
alter table duel.codes         enable row level security;
alter table duel.devices       enable row level security;
alter table duel.code_failures enable row level security;
alter table duel.habits        enable row level security;
alter table duel.checkins      enable row level security;
alter table duel.weigh_ins     enable row level security;
alter table duel.goals         enable row level security;
alter table duel.weeks         enable row level security;
alter table duel.gage_payments enable row level security;
alter table duel.settings      enable row level security;
alter table duel.weigh_days    enable row level security;
alter table duel.proposals     enable row level security;
alter table duel.proposal_goals enable row level security;
alter table duel.seen_results  enable row level security;
alter table duel.badge_unlocks enable row level security;
alter table duel.seen_badges   enable row level security;
alter table duel.rules         enable row level security;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Journal temps réel : public.events
-- ────────────────────────────────────────────────────────────────────────────
-- Une ligne par action (« Laetitia a fait un check-in le 23/11 »), RIEN de privé : ni
-- kilos, ni réponse de check-in. L'app s'y abonne (Realtime, INSERT) puis relit le duel
-- avec get_snapshot. Lisible seulement par une session liée à un joueur (policy, section 6).

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  player_id  text not null references duel.players (id) on delete cascade,
  kind       text not null,
  -- Jour concerné (check-in, pesée) ou manche (enjeu, gage), sinon null.
  day        date,
  created_at timestamptz not null default pg_catalog.now()
);
-- Types d'événements (EventKind de src/data/supabase/api.ts). Redéfinis à chaque exécution :
-- relancer le script après une mise à jour suffit pour accepter un nouveau type.
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'checkin', 'checkin_done', 'weighin', 'proposal', 'proposal_accepted', 'proposal_refused',
  'proposal_cancelled', 'stake', 'gage_paid', 'profile', 'gages', 'badge'));
create index if not exists events_created_at_idx on public.events (created_at);
alter table public.events enable row level security;

-- Temps réel : la table rejoint la publication de Supabase (si elle existe et ne l'a pas déjà).
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication p
             where p.pubname = 'supabase_realtime' and not p.puballtables)
     and not exists (select 1 from pg_catalog.pg_publication_tables t
                     where t.pubname = 'supabase_realtime' and t.schemaname = 'public' and t.tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Petits outils (schéma `duel`, inaccessibles depuis l'API)
-- ────────────────────────────────────────────────────────────────────────────

-- Aujourd'hui, à Paris (RULES.timezone).
create or replace function duel.today() returns date
language sql stable set search_path = '' as $$
  select (duel.now() at time zone 'Europe/Paris')::date
$$;

-- Le joueur lié à la session (auth.uid()), ou null.
create or replace function duel.my_player() returns text
language sql stable set search_path = '' as $$
  select d.player_id from duel.devices d where d.user_id = auth.uid()
$$;

-- Le joueur lié à la session, sinon SQLSTATE 28000 (l'app repasse en « déconnecté »).
create or replace function duel.require_player() returns text
language plpgsql stable set search_path = '' as $$
declare
  v_player text := duel.my_player();
begin
  if v_player is null then
    raise exception using errcode = '28000', message = 'Connecte-toi d’abord 🔑';
  end if;
  return v_player;
end $$;

-- Refus d'une règle du jeu ou d'une saisie : SQLSTATE P0001, message prêt à afficher.
create or replace function duel.fail(p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = p_message;
end $$;

-- Enlève les espaces autour (mêmes caractères que String.prototype.trim en JavaScript).
create or replace function duel.clean(p_text text) returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.btrim(p_text, E'\u0009\u000A\u000B\u000C\u000D                  　﻿')
$$;

-- Un champ texte d'un objet JSON, nettoyé, entre p_min et p_max caractères (sinon P0001).
create or replace function duel.text_field(p_obj jsonb, p_key text, p_min integer, p_max integer, p_message text)
returns text language plpgsql set search_path = '' as $$
declare
  v_text text;
begin
  if pg_catalog.jsonb_typeof(p_obj -> p_key) is distinct from 'string' then
    perform duel.fail(p_message);
  end if;
  v_text := duel.clean(p_obj ->> p_key);
  if pg_catalog.char_length(v_text) < p_min or pg_catalog.char_length(v_text) > p_max then
    perform duel.fail(p_message);
  end if;
  return v_text;
end $$;

-- Conversions qui renvoient null au lieu d'échouer.
create or replace function duel.try_uuid(p_text text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end $$;

create or replace function duel.try_date(p_text text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if p_text is null or p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return p_text::date;
exception when others then
  return null;
end $$;

-- Horodatage au format de JavaScript (Date.toISOString) : '2026-11-23T08:15:00.000Z'.
create or replace function duel.iso(p_at timestamptz) returns text
language sql stable set search_path = '' as $$
  select pg_catalog.to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- ─── Dates (src/core/dates.ts) ───

-- isoDayOf : 1 = lundi … 7 = dimanche.
create or replace function duel.iso_day(p_day date) returns integer
language sql immutable set search_path = '' as $$
  select extract(isodow from p_day)::integer
$$;

-- weekStartOf : le lundi de la manche qui contient ce jour.
create or replace function duel.week_start(p_day date) returns date
language sql immutable set search_path = '' as $$
  select p_day - (duel.iso_day(p_day) - 1)
$$;

-- nextMonday : lundi suivant (strictement après ce jour).
create or replace function duel.next_monday(p_day date) returns date
language sql immutable set search_path = '' as $$
  select duel.week_start(p_day) + 7
$$;

-- ─── Règles du jeu (src/core/scoring.ts, src/core/season.ts) ───

-- canEditCheckin : aujourd'hui et hier (catch_up_days), jamais avant la 1re manche, ni
-- par-dessus la fin d'une manche (sauf catch_up_across_weeks).
create or replace function duel.can_edit_checkin(p_day date, p_today date) returns boolean
language sql stable set search_path = '' as $$
  select (p_today - p_day) >= 0
     and (p_today - p_day) <= r.catch_up_days
     and p_day >= duel.week_start(s.season_start)
     and (r.catch_up_across_weeks or duel.week_start(p_day) = duel.week_start(p_today))
  from duel.rules r cross join duel.settings s
$$;

-- isHabitActiveOn : activeFrom <= jour < activeUntil.
create or replace function duel.habit_active_on(p_from date, p_until date, p_day date) returns boolean
language sql immutable set search_path = '' as $$
  select p_from <= p_day and (p_until is null or p_day < p_until)
$$;

-- weighInDayFor : jour de la pesée en vigueur pour la manche qui contient ce jour
-- (la règle la plus récente qui commence au plus tard ce lundi-là, sinon le jour par défaut).
create or replace function duel.weigh_day_for(p_day date) returns integer
language sql stable set search_path = '' as $$
  select coalesce(
    (select w.iso_day from duel.weigh_days w
      where w.from_day <= duel.week_start(p_day)
      order by w.from_day desc limit 1),
    (select r.default_weigh_day from duel.rules r))
$$;

-- canWeighIn : le jour J uniquement (si only_on_weigh_in_day).
create or replace function duel.can_weigh_in(p_today date) returns boolean
language sql stable set search_path = '' as $$
  select not r.only_on_weigh_in_day or duel.iso_day(p_today) = duel.weigh_day_for(p_today)
  from duel.rules r
$$;

-- isStakeEditable : 0 <= jours depuis le lundi < stake_editable_days.
create or replace function duel.is_stake_editable(p_week date, p_today date) returns boolean
language sql stable set search_path = '' as $$
  select (p_today - p_week) >= 0 and (p_today - p_week) < r.stake_editable_days
  from duel.rules r
$$;

-- Check-in complet (✅ sur le Ring) : toutes les habitudes actives ce jour-là sont remplies.
create or replace function duel.day_complete(p_player text, p_day date) returns boolean
language sql stable set search_path = '' as $$
  select count(*) > 0 and count(*) = count(c.habit_id)
  from duel.habits h
  left join duel.checkins c on c.player_id = h.player_id and c.habit_id = h.id and c.day = p_day
  where h.player_id = p_player and duel.habit_active_on(h.active_from, h.active_until, p_day)
$$;

-- ─── Poids (src/core/weight.ts) ───

-- percentChange en float8, dans le même ordre d'opérations qu'en JavaScript :
-- ((to - from) / from) * 100 → mêmes nombres au bit près.
create or replace function duel.pct(p_from numeric, p_to numeric) returns double precision
language sql immutable set search_path = '' as $$
  select ((p_to::double precision - p_from::double precision) / p_from::double precision) * 100
$$;

-- goalAt (DemoSource) : l'objectif en vigueur ce jour-là (null si aucun ou retiré).
create or replace function duel.goal_at(p_player text, p_day date) returns numeric
language sql stable set search_path = '' as $$
  select g.goal_kg from duel.goals g
  where g.player_id = p_player and g.from_day <= p_day
  order by g.from_day desc limit 1
$$;

-- La toute première pesée (point de départ des %).
create or replace function duel.first_kg(p_player text) returns numeric
language sql stable set search_path = '' as $$
  select w.kg from duel.weigh_ins w where w.player_id = p_player order by w.day limit 1
$$;

-- ─── Ce que l'autre voit de mes % (garantie 3, décisions 18) ───
-- Quand je ne montre pas mes kilos, l'autre ne reçoit que des % ARRONDIS : des % exacts
-- (float8 au bit près) suffiraient à recalculer mes kilos et mon objectif (il n'y a que
-- quelques poids au dixième de kg qui redonnent exactement les mêmes %). Chaque arrondi
-- garde ce que l'app en déduit chez l'autre, identique à ce que calcule mon téléphone :
-- points de pesée (weighInPoints), zone objectif (isInGoalZone), paliers 🪶 (badges.ts).
-- Ce qui reste visible par nature : les points de pesée (le score est public), donc la
-- variation au centième de % quand elle est entre 0 et −1 %. Le reste n'en dit pas plus :
-- l'écart à l'objectif (jamais affiché) ne dit que « dans la zone ou pas », et l'objectif
-- en % depuis le départ est au demi-%.

-- Math.round de JavaScript (au plus proche, les .5 vers le haut), en float8.
create or replace function duel.js_round(p double precision) returns double precision
language sql immutable set search_path = '' as $$
  select case when p - pg_catalog.floor(p) >= 0.5::double precision
              then pg_catalog.floor(p) + 1 else pg_catalog.floor(p) end
$$;

-- Au dixième de % le plus proche (jamais « −0 »).
create or replace function duel.pct_tenth(p double precision) returns double precision
language sql immutable set search_path = '' as $$
  select case when x.v = 0 then 0::double precision else x.v end
  from (select duel.js_round(p * 10) / 10 as v) x
$$;

-- Au demi-% le plus proche (objectif en % depuis le départ, propositions d'objectif).
create or replace function duel.pct_half(p double precision) returns double precision
language sql immutable set search_path = '' as $$
  select case when x.v = 0 then 0::double precision else x.v end
  from (select duel.js_round(p * 2) / 2 as v) x
$$;

-- fromStartPct : au dixième, vers zéro, comme la progression 🪶 de badges.ts
-- (Math.floor(-pct * 10 + 1e-6)) : mêmes paliers débloqués (paliers au dixième de %).
create or replace function duel.mask_from_start(p double precision) returns double precision
language sql immutable set search_path = '' as $$
  select case when x.v = 0 then 0::double precision else x.v end
  from (select pg_catalog.sign(p) * pg_catalog.floor(pg_catalog.abs(p) * 10 + 1e-6::double precision) / 10 as v) x
$$;

-- changePct : les points de pesée (weighInPoints de src/core/scoring.ts) restent les mêmes.
create or replace function duel.mask_change(p double precision) returns double precision
language plpgsql stable set search_path = '' as $$
declare
  v_max  double precision;
  v_full double precision;
  v_pts  double precision;
begin
  if p is null then
    return null;
  end if;
  select r.weigh_max_points, r.full_points_loss_pct into v_max, v_full from duel.rules r;
  -- Les points de cette variation, calculés comme weighInPoints (float8, même ordre).
  v_pts := case when -p <= 0 then 0 else duel.js_round(least(v_max, (-p / v_full) * v_max)) end;
  if v_pts > 0 and v_pts < v_max then
    -- Perte partielle : le % qui rapporte exactement ces points (au centième de %).
    return -(v_pts * v_full / v_max);
  elsif v_pts >= v_max then
    -- Perte pleine : au dixième, jamais moins que le plein.
    return least(duel.pct_tenth(p), -v_full);
  end if;
  -- Hausse, stable, ou perte minuscule (0 point) : au dixième.
  return duel.pct_tenth(p);
end $$;

-- goalDistancePct : l'app ne s'en sert que pour « dans la zone objectif ou pas »
-- (isInGoalZone : ±goal_tolerance_pct, + 1e-9) et ne l'affiche pas. Dans la zone : 0 ;
-- sinon le % entier vers l'extérieur (toujours hors de la zone).
create or replace function duel.mask_goal_distance(p double precision) returns double precision
language plpgsql stable set search_path = '' as $$
declare
  v_tol double precision;
begin
  if p is null then
    return null;
  end if;
  select r.goal_tolerance_pct into v_tol from duel.rules r;
  if pg_catalog.abs(p) <= v_tol + 1e-9::double precision then
    return 0;
  end if;
  return pg_catalog.sign(p) * pg_catalog.ceil(pg_catalog.abs(p));
end $$;

-- ─── Journal ───

-- Ajoute un événement, et fait le ménage au passage (plus de 60 jours : bon marché grâce à l'index).
create or replace function duel.emit(p_player text, p_kind text, p_day date default null) returns void
language sql set search_path = '' as $$
  insert into public.events (player_id, kind, day, created_at) values (p_player, p_kind, p_day, duel.now());
  delete from public.events e where e.created_at < duel.now() - interval '60 days';
$$;

-- ─── Codes ───

-- Exactement 6 chiffres (CODE_LENGTH de src/data/source.ts).
create or replace function duel.check_code_format(p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    perform duel.fail('Le code, c’est 6 chiffres 🔢');
  end if;
end $$;

-- Verrou : trop de codes faux récents pour ce prénom → il faut attendre, même avec le bon code.
-- p_user null : tous les essais sur ce prénom (écran de connexion, décision 20). Sinon :
-- seulement ceux de cette session (changer son code depuis un téléphone déjà connecté :
-- un inconnu qui s'acharne sur l'écran de connexion ne doit pas l'en empêcher).
drop function if exists duel.check_code_lock(text);
create or replace function duel.check_code_lock(p_player text, p_user uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_max     integer;
  v_minutes integer;
  v_count   integer;
  v_unlock  timestamptz;
  v_wait    integer;
begin
  select r.code_max_failures, r.code_lock_minutes into v_max, v_minutes from duel.rules r;
  -- Ménage : les échecs sortis de la fenêtre ne comptent plus.
  delete from duel.code_failures f
  where f.player_id = p_player and f.failed_at <= duel.now() - pg_catalog.make_interval(mins => v_minutes);
  select count(*) into v_count from duel.code_failures f
  where f.player_id = p_player and (p_user is null or f.user_id = p_user);
  if v_count >= v_max then
    -- Le verrou saute quand le v_max-ième échec le plus récent sort de la fenêtre.
    select f.failed_at + pg_catalog.make_interval(mins => v_minutes) into v_unlock
    from duel.code_failures f where f.player_id = p_player and (p_user is null or f.user_id = p_user)
    order by f.failed_at desc offset v_max - 1 limit 1;
    v_wait := greatest(1, ceil(extract(epoch from (v_unlock - duel.now())) / 60)::integer);
    perform duel.fail(pg_catalog.format(E'Trop de codes faux 🥵 Réessaie dans %s min ⏳', v_wait));
  end if;
end $$;

-- Code faux : on COMPTE l'échec, donc on ne lève pas d'exception (elle annulerait tout).
-- À la place, statut HTTP 400 pour PostgREST (la transaction est quand même validée) et le
-- corps de la réponse est une erreur au format PostgREST : supabase-js la renvoie dans
-- `error` ({ code: 'P0001', message: 'Code incorrect 🙅' }), comme une vraie exception.
create or replace function duel.code_failure(p_player text) returns jsonb
language plpgsql set search_path = '' as $$
begin
  -- auth.uid() : la session qui s'est trompée (voir check_code_lock).
  insert into duel.code_failures (player_id, user_id, failed_at) values (p_player, auth.uid(), duel.now());
  perform pg_catalog.set_config('response.status', '400', true);
  return pg_catalog.jsonb_build_object(
    'code', 'P0001', 'message', 'Code incorrect 🙅', 'details', null, 'hint', null);
end $$;

-- ─── Propositions (decide de src/data/demo/DemoSource.ts) ───

-- Accepte ou refuse. Acceptée : effet le lundi suivant (nextMonday d'aujourd'hui).
create or replace function duel.decide(p_id uuid, p_accept boolean) returns void
language plpgsql set search_path = '' as $$
declare
  v_p    duel.proposals;
  v_from date := duel.next_monday(duel.today());
  v_old  duel.habits;
  v_goal numeric;
begin
  select * into v_p from duel.proposals pr where pr.id = p_id;
  update duel.proposals pr
  set status = case when p_accept then 'accepted' else 'refused' end,
      decided_at = duel.now(),
      effective_from = case when p_accept then v_from end
  where pr.id = p_id;
  if not p_accept then
    return;
  end if;

  case v_p.kind
  when 'habit_add' then
    -- Nouvelle habitude de l'auteur, à la fin de sa liste, sans badge.
    insert into duel.habits (player_id, name, hint, emoji, kind, badge_key, active_from, active_until, sort_order)
    select v_p.author_id, v_p.payload ->> 'name', v_p.payload ->> 'hint', v_p.payload ->> 'emoji',
           v_p.payload ->> 'habitKind', null, v_from, null,
           coalesce((select max(h.sort_order) from duel.habits h where h.player_id = v_p.author_id), -1) + 1;
  when 'habit_disable' then
    -- Jamais une habitude déjà close (ce serait la rouvrir ou déplacer sa fin).
    update duel.habits h set active_until = v_from
    where h.id = (v_p.payload ->> 'habitId')::uuid and h.active_until is null;
  when 'habit_kind' then
    -- On clôt l'ancienne et on en crée une nouvelle : l'historique garde son type.
    -- Rien si elle est déjà close.
    select * into v_old from duel.habits h
    where h.id = (v_p.payload ->> 'habitId')::uuid and h.active_until is null;
    if found then
      update duel.habits h set active_until = v_from where h.id = v_old.id;
      insert into duel.habits (player_id, name, hint, emoji, kind, badge_key, active_from, active_until, sort_order)
      values (v_old.player_id, v_old.name, v_old.hint, v_old.emoji, v_p.payload ->> 'habitKind', null,
              v_from, null, v_old.sort_order);
    end if;
  when 'weigh_day' then
    -- Une règle par lundi : la nouvelle remplace celle du même lundi.
    insert into duel.weigh_days (from_day, iso_day) values (v_from, (v_p.payload ->> 'isoDay')::integer)
    on conflict (from_day) do update set iso_day = excluded.iso_day;
  when 'goal_weight' then
    -- Les vrais kilos viennent de la table privée ; null = objectif retiré.
    select g.goal_kg into v_goal from duel.proposal_goals g where g.proposal_id = p_id;
    if (v_p.payload ->> 'clear')::boolean or v_goal is not null then
      insert into duel.goals (player_id, from_day, goal_kg)
      values (v_p.author_id, v_from, case when (v_p.payload ->> 'clear')::boolean then null else v_goal end)
      on conflict (player_id, from_day) do update set goal_kg = excluded.goal_kg;
    end if;
  else
    null;
  end case;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Fonctions de l'app : connexion (src/data/supabase/api.ts › DuelRpc)
-- ────────────────────────────────────────────────────────────────────────────
-- Toutes : SECURITY DEFINER (elles seules touchent aux tables) et search_path vide
-- (tout est qualifié : duel., extensions., auth., pg_catalog.).

-- Les deux joueurs pour l'écran de connexion (appelable sans session).
create or replace function public.login_players() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', p.id, 'name', p.name, 'emoji', p.emoji, 'color', p.color,
    'hasCode', exists (select 1 from duel.codes c where c.player_id = p.id)
  ) order by p.sort_order), '[]'::jsonb)
  from duel.players p
$$;

-- Lie la session au joueur. Premier code pour ce prénom → il devient le sien.
create or replace function public.claim_player(p_player text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_hash    text;
  v_created boolean := false;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'Connecte-toi d’abord 🔑';
  end if;
  perform duel.check_code_format(p_code);
  -- Verrouille le joueur : deux téléphones qui choisissent un code en même temps passent l'un après l'autre.
  perform 1 from duel.players p where p.id = p_player for update;
  if not found then
    perform duel.fail('Joueur inconnu 🤔');
  end if;
  perform duel.check_code_lock(p_player, null);

  select c.code_hash into v_hash from duel.codes c where c.player_id = p_player;
  if v_hash is null then
    insert into duel.codes (player_id, code_hash, updated_at)
    values (p_player, extensions.crypt(p_code, extensions.gen_salt('bf')), duel.now());
    v_created := true;
  elsif v_hash <> extensions.crypt(p_code, v_hash) then
    return duel.code_failure(p_player);
  end if;

  -- Bon code : on oublie les échecs et on lie ce téléphone (plusieurs téléphones par joueur : OK).
  delete from duel.code_failures f where f.player_id = p_player;
  insert into duel.devices (user_id, player_id, linked_at) values (v_uid, p_player, duel.now())
  on conflict (user_id) do update set player_id = excluded.player_id, linked_at = excluded.linked_at;
  return pg_catalog.jsonb_build_object('created', v_created);
end $$;

-- Change le code du joueur lié (l'ancien doit être bon : sinon compté comme un échec).
-- Les AUTRES téléphones de ce joueur sont déconnectés : quelqu'un qui avait vu l'ancien code
-- et s'en était servi est mis dehors. Ce téléphone-ci reste connecté.
create or replace function public.change_code(p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me   text := duel.require_player();
  v_hash text;
begin
  perform duel.check_code_format(p_old);
  perform duel.check_code_format(p_new);
  perform 1 from duel.players p where p.id = v_me for update;
  -- Seulement les erreurs de CE téléphone (voir check_code_lock).
  perform duel.check_code_lock(v_me, auth.uid());
  select c.code_hash into v_hash from duel.codes c where c.player_id = v_me;
  if v_hash is not null and v_hash <> extensions.crypt(p_old, v_hash) then
    return duel.code_failure(v_me);
  end if;
  insert into duel.codes (player_id, code_hash, updated_at)
  values (v_me, extensions.crypt(p_new, extensions.gen_salt('bf')), duel.now())
  on conflict (player_id) do update set code_hash = excluded.code_hash, updated_at = excluded.updated_at;
  delete from duel.devices d where d.player_id = v_me and d.user_id <> auth.uid();
  delete from duel.code_failures f where f.player_id = v_me;
  return null;
end $$;

-- « Débloquer mon prénom » (téléphone déjà connecté) : efface les codes faux, ceux d'un
-- inconnu compris, pour pouvoir connecter un nouveau téléphone tout de suite. Renvoie le
-- nombre de codes faux récents (dans la fenêtre du verrou) qu'il y avait.
create or replace function public.clear_code_failures() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_me      text := duel.require_player();
  v_minutes integer;
  v_recent  integer;
begin
  select r.code_lock_minutes into v_minutes from duel.rules r;
  select count(*) into v_recent from duel.code_failures f
  where f.player_id = v_me and f.failed_at > duel.now() - pg_catalog.make_interval(mins => v_minutes);
  delete from duel.code_failures f where f.player_id = v_me;
  return v_recent;
end $$;

-- Dépannage, depuis le SQL Editor de Supabase seulement (aucun téléphone ne peut l'appeler) :
-- pose le code d'un joueur et déconnecte TOUS ses téléphones (code oublié, ou vu par
-- quelqu'un). Ex. : select duel.reset_code('arthus', '482916');
create or replace function duel.reset_code(p_player text, p_code text) returns text
language plpgsql set search_path = '' as $$
begin
  perform duel.check_code_format(p_code);
  perform 1 from duel.players p where p.id = p_player for update;
  if not found then
    perform duel.fail('Joueur inconnu 🤔');
  end if;
  insert into duel.codes (player_id, code_hash, updated_at)
  values (p_player, extensions.crypt(p_code, extensions.gen_salt('bf')), duel.now())
  on conflict (player_id) do update set code_hash = excluded.code_hash, updated_at = excluded.updated_at;
  delete from duel.devices d where d.player_id = p_player;
  delete from duel.code_failures f where f.player_id = p_player;
  return pg_catalog.format('Code de %s changé ✅ Ses téléphones devront taper ce code.', p_player);
end $$;

-- « Se déconnecter » : délie cette session (les autres téléphones restent connectés).
create or replace function public.release_device() returns void
language sql security definer set search_path = '' as $$
  delete from duel.devices d where d.user_id = auth.uid();
$$;

-- Cette session est-elle liée à un joueur ? (sert à la policy de public.events)
create or replace function public.is_duel_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select duel.my_player() is not null
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. Fonctions de l'app : lecture et actions du joueur lié
-- ────────────────────────────────────────────────────────────────────────────

-- Tout le duel, au format DuelSnapshot (src/core/types.ts), filtré pour le joueur lié :
-- kilos de l'autre masqués sauf s'il les montre (garantie 3 de src/data/source.ts), et ses %
-- arrondis (duel.mask_*, section 3). Les % sont calculés comme deriveWeighIns
-- (src/core/weight.ts), en float8 : les miens (ou ceux de l'autre s'il montre ses kilos)
-- sont exacts au bit près.
create or replace function public.get_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' set extra_float_digits = 1 as $$
declare
  v_me    text := duel.require_player();
  v_today date := duel.today();
begin
  return pg_catalog.jsonb_build_object(
    'meId', v_me,

    -- goalKg = objectif en vigueur aujourd'hui (masqué pour l'autre), goalFromStartPct toujours
    -- visible (au demi-% pour l'autre).
    'players', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', p.id, 'name', p.name, 'emoji', p.emoji, 'color', p.color, 'showKg', p.show_kg,
        'goalKg', case when p.id = v_me or p.show_kg then g.kg end,
        'goalFromStartPct', case when g.kg is null or f.kg is null then null
                                 when p.id = v_me or p.show_kg then duel.pct(f.kg, g.kg)
                                 else duel.pct_half(duel.pct(f.kg, g.kg)) end
      ) order by p.sort_order), '[]'::jsonb)
      from duel.players p
      cross join lateral (select duel.goal_at(p.id, v_today) as kg) g
      cross join lateral (select duel.first_kg(p.id) as kg) f
    ),

    'habits', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', h.id, 'playerId', h.player_id, 'name', h.name, 'hint', h.hint, 'emoji', h.emoji,
        'kind', h.kind, 'badgeKey', h.badge_key, 'activeFrom', h.active_from,
        'activeUntil', h.active_until, 'sortOrder', h.sort_order
      ) order by p.sort_order, h.sort_order, h.active_from, h.created_at, h.id), '[]'::jsonb)
      from duel.habits h join duel.players p on p.id = h.player_id
    ),

    'checkins', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'playerId', c.player_id, 'habitId', c.habit_id, 'day', c.day, 'value', c.value,
        'updatedAt', duel.iso(c.updated_at)
      ) order by c.day, c.player_id collate "C", c.habit_id), '[]'::jsonb)
      from duel.checkins c
    ),

    -- deriveWeighIns : changePct depuis la pesée précédente (null pour la 1re), fromStartPct
    -- depuis la 1re, goalDistancePct à l'objectif en vigueur CE jour-là. Tri : jour puis joueur.
    -- Pesées de l'autre qui ne montre pas ses kilos : pas de kg, et des % arrondis.
    'weighIns', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'playerId', w.player_id, 'day', w.day,
        'weightKg', case when w.exact then w.kg end,
        'changePct', case when w.prev_kg is null then null
                          when w.exact then duel.pct(w.prev_kg, w.kg)
                          else duel.mask_change(duel.pct(w.prev_kg, w.kg)) end,
        'fromStartPct', case when w.exact then duel.pct(w.start_kg, w.kg)
                             else duel.mask_from_start(duel.pct(w.start_kg, w.kg)) end,
        'goalDistancePct', case when w.goal_kg is null then null
                                when w.exact then duel.pct(w.goal_kg, w.kg)
                                else duel.mask_goal_distance(duel.pct(w.goal_kg, w.kg)) end
      ) order by w.day, w.player_id collate "C"), '[]'::jsonb)
      from (
        select wi.player_id, wi.day, wi.kg, (wi.player_id = v_me or p.show_kg) as exact,
               pg_catalog.lag(wi.kg) over (partition by wi.player_id order by wi.day) as prev_kg,
               pg_catalog.first_value(wi.kg) over (partition by wi.player_id order by wi.day) as start_kg,
               duel.goal_at(wi.player_id, wi.day) as goal_kg
        from duel.weigh_ins wi join duel.players p on p.id = wi.player_id
      ) w
    ),

    'weeks', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'weekStart', wk.week_start, 'stake', wk.stake,
        'gagePaid', coalesce((select pg_catalog.jsonb_object_agg(gp.player_id, gp.paid)
                              from duel.gage_payments gp where gp.week_start = wk.week_start), '{}'::jsonb)
      ) order by wk.week_start), '[]'::jsonb)
      from duel.weeks wk
    ),

    'settings', (
      select pg_catalog.jsonb_build_object(
        'seasonStart', s.season_start,
        'weighInDays', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                                   'from', wd.from_day, 'isoDay', wd.iso_day) order by wd.from_day)
                                 from duel.weigh_days wd), '[]'::jsonb),
        'gages', pg_catalog.to_jsonb(s.gages))
      from duel.settings s
    ),

    -- Objectif d'une proposition : les kilos viennent de la table privée, masqués pour l'autre ;
    -- le % (payload.goalFromStartPct) est rangé au demi-% par propose, le même pour les deux.
    'proposals', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', pr.id, 'authorId', pr.author_id,
        'payload', case when pr.kind = 'goal_weight'
                     then pr.payload || pg_catalog.jsonb_build_object(
                            'goalKg', case when pr.author_id = v_me or a.show_kg then pg.goal_kg end)
                     else pr.payload end,
        'status', pr.status, 'createdAt', duel.iso(pr.created_at), 'decidedAt', duel.iso(pr.decided_at),
        'effectiveFrom', pr.effective_from
      ) order by pr.seq), '[]'::jsonb)
      from duel.proposals pr
      join duel.players a on a.id = pr.author_id
      left join duel.proposal_goals pg on pg.proposal_id = pr.id
    ),

    'seenResults', (
      select coalesce(pg_catalog.jsonb_agg(sr.week_start order by sr.week_start), '[]'::jsonb)
      from duel.seen_results sr where sr.player_id = v_me
    ),

    'badgeUnlocks', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'playerId', u.player_id, 'badgeId', u.badge_id, 'tier', u.tier, 'day', u.day
      ) order by u.day, u.player_id collate "C", u.badge_id collate "C", u.tier nulls first), '[]'::jsonb)
      from duel.badge_unlocks u
    ),

    'seenBadges', (
      select coalesce(pg_catalog.jsonb_agg(sb.seen_key order by sb.seq), '[]'::jsonb)
      from duel.seen_badges sb where sb.player_id = v_me
    )
  );
end $$;

-- Remplit / corrige (p_value null = efface) une de SES habitudes.
create or replace function public.set_checkin(p_day date, p_habit uuid, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me     text := duel.require_player();
  v_habit  duel.habits;
  v_before boolean;
begin
  select * into v_habit from duel.habits h where h.id = p_habit and h.player_id = v_me;
  if not found then
    perform duel.fail('Habitude inconnue 🤔');
  end if;
  if p_day is null or not coalesce(duel.can_edit_checkin(p_day, duel.today()), false) then
    perform duel.fail('Ce jour n’est plus modifiable 🔒');
  end if;
  if not duel.habit_active_on(v_habit.active_from, v_habit.active_until, p_day) then
    perform duel.fail('Cette habitude ne compte pas ce jour-là 📅');
  end if;
  if p_value is not null and not (
       (v_habit.kind = 'avoid' and p_value in ('nickel', 'unpeu', 'craquage'))
    or (v_habit.kind = 'do' and p_value in ('fait', 'pasfait'))) then
    perform duel.fail('Réponse inconnue pour cette habitude 🤔');
  end if;

  v_before := duel.day_complete(v_me, p_day);
  if p_value is null then
    delete from duel.checkins c where c.player_id = v_me and c.habit_id = p_habit and c.day = p_day;
  else
    insert into duel.checkins (player_id, habit_id, day, value, updated_at)
    values (v_me, p_habit, p_day, p_value, duel.now())
    on conflict (player_id, habit_id, day) do update set value = excluded.value, updated_at = excluded.updated_at;
  end if;
  -- 'checkin_done' seulement quand le jour DEVIENT complet.
  perform duel.emit(v_me,
    case when not v_before and duel.day_complete(v_me, p_day) then 'checkin_done' else 'checkin' end,
    p_day);
end $$;

-- Enregistre / corrige SA pesée : aujourd'hui seulement, et le jour J (canWeighIn).
create or replace function public.save_weigh_in(p_day date, p_kg numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me    text := duel.require_player();
  v_today date := duel.today();
  v_min   numeric;
  v_max   numeric;
  v_kg    numeric := round(p_kg, 1);
begin
  if p_day is distinct from v_today or not coalesce(duel.can_weigh_in(v_today), false) then
    perform duel.fail('Ce n’est pas le jour de la pesée ⚖️');
  end if;
  select r.min_kg, r.max_kg into v_min, v_max from duel.rules r;
  if v_kg is null or v_kg < v_min or v_kg > v_max then
    perform duel.fail(pg_catalog.format(E'Le poids doit être entre %s et %s kg 🤔',
      pg_catalog.trim_scale(v_min), pg_catalog.trim_scale(v_max)));
  end if;
  insert into duel.weigh_ins (player_id, day, kg, updated_at) values (v_me, p_day, v_kg, duel.now())
  on conflict (player_id, day) do update set kg = excluded.kg, updated_at = excluded.updated_at;
  perform duel.emit(v_me, 'weighin', p_day);
end $$;

-- Profil du joueur lié : name, emoji, color, showKg (immédiat).
create or replace function public.update_profile(p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me    text := duel.require_player();
  v_key   text;
  v_name  text;
  v_emoji text;
  v_color text;
  v_show  boolean;
begin
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    perform duel.fail('Réglage inconnu 🤔');
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_patch) loop
    if v_key not in ('name', 'emoji', 'color', 'showKg') then
      perform duel.fail('Réglage inconnu 🤔');
    end if;
  end loop;
  if p_patch ? 'name' then
    v_name := duel.text_field(p_patch, 'name', 1, 24, E'Prénom entre 1 et 24 caractères ✏️');
  end if;
  if p_patch ? 'emoji' then
    v_emoji := duel.text_field(p_patch, 'emoji', 1, 16, 'Choisis un emoji 🙂');
  end if;
  if p_patch ? 'color' then
    if pg_catalog.jsonb_typeof(p_patch -> 'color') is distinct from 'string'
       or (p_patch ->> 'color') !~ '^#[0-9A-Fa-f]{6}$' then
      perform duel.fail('Couleur invalide 🎨');
    end if;
    v_color := p_patch ->> 'color';
  end if;
  if p_patch ? 'showKg' then
    if pg_catalog.jsonb_typeof(p_patch -> 'showKg') is distinct from 'boolean' then
      perform duel.fail('Réglage inconnu 🤔');
    end if;
    v_show := (p_patch ->> 'showKg')::boolean;
  end if;
  update duel.players p
  set name = coalesce(v_name, p.name), emoji = coalesce(v_emoji, p.emoji),
      color = coalesce(v_color, p.color), show_kg = coalesce(v_show, p.show_kg)
  where p.id = v_me;
  perform duel.emit(v_me, 'profile');
end $$;

-- Nom / emoji / précision d'une de SES habitudes (cosmétique, immédiat).
create or replace function public.update_habit_look(p_habit uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me    text := duel.require_player();
  v_key   text;
  v_name  text;
  v_emoji text;
  v_hint  text;
begin
  perform 1 from duel.habits h where h.id = p_habit and h.player_id = v_me;
  if not found then
    perform duel.fail('Habitude inconnue 🤔');
  end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    perform duel.fail('Réglage inconnu 🤔');
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_patch) loop
    if v_key not in ('name', 'emoji', 'hint') then
      perform duel.fail('Réglage inconnu 🤔');
    end if;
  end loop;
  if p_patch ? 'name' then
    v_name := duel.text_field(p_patch, 'name', 1, 24, E'Nom d’habitude entre 1 et 24 caractères ✏️');
  end if;
  if p_patch ? 'emoji' then
    v_emoji := duel.text_field(p_patch, 'emoji', 1, 16, 'Choisis un emoji 🙂');
  end if;
  if p_patch ? 'hint' then
    v_hint := duel.text_field(p_patch, 'hint', 0, 40, E'Précision de 40 caractères maximum ✏️');
  end if;
  update duel.habits h
  set name = coalesce(v_name, h.name), emoji = coalesce(v_emoji, h.emoji), hint = coalesce(v_hint, h.hint)
  where h.id = p_habit;
  perform duel.emit(v_me, 'profile');
end $$;

-- Nouvelle proposition de changement de règle (remplace celle en attente sur le même sujet).
-- Acceptée d'office seulement si duel.rules.require_approval est faux (RULES.proposals) :
-- jamais sur la parole du téléphone (l'ancienne version prenait un p_auto_accept, supprimé).
drop function if exists public.propose(jsonb, boolean);
create or replace function public.propose(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = '' set extra_float_digits = 1 as $$
declare
  v_me      text := duel.require_player();
  v_kind    text := p_payload ->> 'kind';
  v_habit   duel.habits;
  v_payload jsonb;
  v_subject text;
  v_name    text;
  v_hkind   text;
  v_num     numeric;
  v_clear   boolean;
  v_goal    numeric;
  v_first   numeric;
  v_min     numeric;
  v_max     numeric;
  v_need    boolean;
  v_id      uuid;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or v_kind is null or v_kind not in ('habit_add', 'habit_disable', 'habit_kind', 'weigh_day', 'goal_weight') then
    perform duel.fail('Proposition inconnue 🤔');
  end if;

  -- Habitude visée (habit_disable, habit_kind) : la sienne, encore active.
  if v_kind in ('habit_disable', 'habit_kind') then
    select * into v_habit from duel.habits h
    where h.id = duel.try_uuid(p_payload ->> 'habitId') and h.player_id = v_me;
    if not found then
      perform duel.fail('Habitude inconnue 🤔');
    end if;
    if v_habit.active_until is not null then
      perform duel.fail('Cette habitude est déjà désactivée 🤷');
    end if;
  end if;
  -- Type d'habitude (habit_add, habit_kind).
  if v_kind in ('habit_add', 'habit_kind') then
    v_hkind := p_payload ->> 'habitKind';
    if pg_catalog.jsonb_typeof(p_payload -> 'habitKind') is distinct from 'string' or v_hkind not in ('avoid', 'do') then
      perform duel.fail('Type d’habitude inconnu 🤔');
    end if;
  end if;

  if v_kind = 'habit_add' then
    v_name := duel.text_field(p_payload, 'name', 1, 24, E'Nom d’habitude entre 1 et 24 caractères ✏️');
    v_payload := pg_catalog.jsonb_build_object(
      'kind', v_kind, 'name', v_name,
      'emoji', duel.text_field(p_payload, 'emoji', 1, 16, 'Choisis un emoji 🙂'),
      'hint', case when coalesce(pg_catalog.jsonb_typeof(p_payload -> 'hint'), 'null') = 'null' then ''
                   else duel.text_field(p_payload, 'hint', 0, 40, E'Précision de 40 caractères maximum ✏️') end,
      'habitKind', v_hkind);
    -- sameSubject : deux nouvelles habitudes du même nom (sans majuscules ni espaces autour).
    v_subject := 'habit_add|' || pg_catalog.lower(v_name);
  elsif v_kind = 'habit_disable' then
    v_payload := pg_catalog.jsonb_build_object('kind', v_kind, 'habitId', v_habit.id);
    -- Même sujet que habit_kind sur la même habitude : une seule proposition à la fois par
    -- habitude, sinon la seconde, acceptée plus tard, rouvrirait une habitude déjà close.
    v_subject := 'habit|' || v_habit.id::text;
  elsif v_kind = 'habit_kind' then
    v_payload := pg_catalog.jsonb_build_object('kind', v_kind, 'habitId', v_habit.id, 'habitKind', v_hkind);
    v_subject := 'habit|' || v_habit.id::text;
  elsif v_kind = 'weigh_day' then
    if pg_catalog.jsonb_typeof(p_payload -> 'isoDay') is distinct from 'number' then
      perform duel.fail('Jour de pesée inconnu 🤔');
    end if;
    v_num := (p_payload ->> 'isoDay')::numeric;
    if v_num <> trunc(v_num) or v_num < 1 or v_num > 7 then
      perform duel.fail('Jour de pesée inconnu 🤔');
    end if;
    v_payload := pg_catalog.jsonb_build_object('kind', v_kind, 'isoDay', v_num::integer);
    v_subject := 'weigh_day';
  else -- goal_weight
    if pg_catalog.jsonb_typeof(p_payload -> 'clear') is distinct from 'boolean' then
      perform duel.fail('Proposition inconnue 🤔');
    end if;
    v_clear := (p_payload ->> 'clear')::boolean;
    if not v_clear then
      select r.min_kg, r.max_kg into v_min, v_max from duel.rules r;
      if pg_catalog.jsonb_typeof(p_payload -> 'goalKg') is distinct from 'number' then
        v_goal := null;
      else
        v_goal := round((p_payload ->> 'goalKg')::numeric, 1);
      end if;
      if v_goal is null or v_goal < v_min or v_goal > v_max then
        perform duel.fail(pg_catalog.format(E'Le poids doit être entre %s et %s kg 🤔',
          pg_catalog.trim_scale(v_min), pg_catalog.trim_scale(v_max)));
      end if;
      v_first := duel.first_kg(v_me);
    end if;
    -- Pas de kilos dans le payload : seulement le % depuis la 1re pesée (null sans pesée),
    -- au demi-% (un % exact suffirait à retrouver les kilos, voir duel.mask_*).
    v_payload := pg_catalog.jsonb_build_object(
      'kind', v_kind, 'clear', v_clear,
      'goalFromStartPct', case when v_goal is not null and v_first is not null
                               then duel.pct_half(duel.pct(v_first, v_goal)) end);
    v_subject := 'goal_weight';
  end if;

  -- Une seule proposition en attente par auteur et par sujet (décision 17).
  update duel.proposals pr set status = 'cancelled', decided_at = duel.now()
  where pr.author_id = v_me and pr.status = 'pending' and pr.subject = v_subject;

  insert into duel.proposals (author_id, kind, subject, payload, created_at)
  values (v_me, v_kind, v_subject, v_payload, duel.now())
  returning id into v_id;
  if v_kind = 'goal_weight' then
    insert into duel.proposal_goals (proposal_id, goal_kg) values (v_id, v_goal);
  end if;

  -- RULES.proposals.requireApproval faux (recopié dans duel.rules) : acceptée d'office.
  select r.require_approval into v_need from duel.rules r;
  if not coalesce(v_need, true) then
    perform duel.decide(v_id, true);
    perform duel.emit(v_me, 'proposal_accepted');
  else
    perform duel.emit(v_me, 'proposal');
  end if;
  return v_id;
end $$;

-- Réponse de l'AUTRE joueur à une proposition en attente.
create or replace function public.answer_proposal(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := duel.require_player();
  v_p  duel.proposals;
begin
  select * into v_p from duel.proposals pr where pr.id = p_id for update;
  if not found then
    perform duel.fail('Proposition introuvable 🤔');
  end if;
  if v_p.author_id = v_me then
    perform duel.fail('C’est à l’autre de répondre 😉');
  end if;
  if v_p.status <> 'pending' then
    perform duel.fail('Cette proposition est déjà réglée 🤷');
  end if;
  if p_accept is null then
    perform duel.fail('Réponse inconnue 🤔');
  end if;
  -- Habitude déjà close entre-temps (autre proposition acceptée) : on ne la rouvre pas.
  if p_accept and v_p.kind in ('habit_disable', 'habit_kind') and exists (
       select 1 from duel.habits h
       where h.id = duel.try_uuid(v_p.payload ->> 'habitId') and h.active_until is not null) then
    perform duel.fail('Cette habitude est déjà désactivée 🤷');
  end if;
  perform duel.decide(p_id, p_accept);
  perform duel.emit(v_me, case when p_accept then 'proposal_accepted' else 'proposal_refused' end);
end $$;

-- L'auteur annule sa proposition en attente (événement 'proposal_cancelled' : l'autre relit
-- le duel, sans toast « propose un changement »).
create or replace function public.cancel_proposal(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := duel.require_player();
  v_p  duel.proposals;
begin
  select * into v_p from duel.proposals pr where pr.id = p_id for update;
  if not found then
    perform duel.fail('Proposition introuvable 🤔');
  end if;
  if v_p.author_id <> v_me then
    perform duel.fail('Seul l’auteur peut annuler sa proposition 😉');
  end if;
  if v_p.status <> 'pending' then
    perform duel.fail('Cette proposition est déjà réglée 🤷');
  end if;
  update duel.proposals pr set status = 'cancelled', decided_at = duel.now() where pr.id = p_id;
  perform duel.emit(v_me, 'proposal_cancelled');
end $$;

-- Remplace l'enjeu d'une manche (isStakeEditable : le lundi seulement, par défaut).
create or replace function public.set_stake(p_week date, p_stake text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me    text := duel.require_player();
  v_stake text := duel.clean(p_stake);
begin
  if v_stake is null or pg_catalog.char_length(v_stake) < 1 or pg_catalog.char_length(v_stake) > 120 then
    perform duel.fail(E'Enjeu entre 1 et 120 caractères ✏️');
  end if;
  if p_week is null or duel.iso_day(p_week) <> 1 then
    perform duel.fail('Une manche commence un lundi 📅');
  end if;
  if not coalesce(duel.is_stake_editable(p_week, duel.today()), false) then
    perform duel.fail('L’enjeu est verrouillé 🔒');
  end if;
  insert into duel.weeks (week_start, stake, updated_at) values (p_week, v_stake, duel.now())
  on conflict (week_start) do update set stake = excluded.stake, updated_at = excluded.updated_at;
  perform duel.emit(v_me, 'stake', p_week);
end $$;

-- Tirage automatique (garantie 5) : pose l'enjeu SEULEMENT s'il n'y en a pas encore.
-- Les deux téléphones tirent le même gage (drawStake) : le second appel ne change rien.
-- Le gage doit être dans la liste de la roulette : pas de texte libre par ce chemin (le
-- texte libre passe par set_stake, verrouillé après le lundi).
create or replace function public.ensure_stake(p_week date, p_stake text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me    text := duel.require_player();
  v_stake text := duel.clean(p_stake);
  v_first date;
  v_rows  integer;
  v_now   text;
begin
  select duel.week_start(s.season_start) into v_first from duel.settings s;
  if p_week is null or duel.iso_day(p_week) <> 1 then
    perform duel.fail('Une manche commence un lundi 📅');
  end if;
  if p_week < v_first or p_week > duel.week_start(duel.today()) then
    perform duel.fail('Cette manche n’a pas encore commencé ⏳');
  end if;
  if v_stake is null or not exists (
       select 1 from duel.settings s cross join pg_catalog.unnest(s.gages) as g(txt) where duel.clean(g.txt) = v_stake) then
    perform duel.fail('Ce gage n’est pas dans la liste de la roulette 🎲');
  end if;
  insert into duel.weeks as wk (week_start, stake, updated_at) values (p_week, v_stake, duel.now())
  on conflict (week_start) do update set stake = excluded.stake, updated_at = excluded.updated_at
  where wk.stake is null or duel.clean(wk.stake) = '';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    perform duel.emit(v_me, 'stake', p_week);
  end if;
  select wk.stake into v_now from duel.weeks wk where wk.week_start = p_week;
  return v_now;
end $$;

-- Liste des gages de la roulette (au moins 1, 200 au plus : simple garde-fou, l'app ne
-- limite pas leur nombre ; 120 caractères par gage, vides retirés).
-- Événement 'gages' : l'autre relit le duel, sans toast.
create or replace function public.set_gages(p_gages text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me    text := duel.require_player();
  v_gages text[];
begin
  v_gages := array(
    select duel.clean(g.txt) from pg_catalog.unnest(p_gages) with ordinality as g(txt, pos)
    where duel.clean(g.txt) <> '' order by g.pos);
  if pg_catalog.cardinality(v_gages) < 1 then
    perform duel.fail('Il faut au moins un gage pour la roulette 🎲');
  end if;
  if pg_catalog.cardinality(v_gages) > 200 then
    perform duel.fail('200 gages maximum, c’est déjà une sacrée roulette 🎲');
  end if;
  if exists (select 1 from pg_catalog.unnest(v_gages) as g(txt) where pg_catalog.char_length(g.txt) > 120) then
    perform duel.fail(E'Un gage fait 120 caractères maximum ✏️');
  end if;
  update duel.settings s set gages = v_gages;
  perform duel.emit(v_me, 'gages');
end $$;

-- « Gage payé ✅ » : seul l'AUTRE joueur valide.
create or replace function public.set_gage_paid(p_week date, p_player text, p_paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := duel.require_player();
begin
  if p_player = v_me then
    perform duel.fail('C’est à l’autre de valider ton gage 😉');
  end if;
  perform 1 from duel.players p where p.id = p_player;
  if not found then
    perform duel.fail('Joueur inconnu 🤔');
  end if;
  if p_week is null or duel.iso_day(p_week) <> 1 then
    perform duel.fail('Une manche commence un lundi 📅');
  end if;
  if p_paid is null then
    perform duel.fail('Réponse inconnue 🤔');
  end if;
  insert into duel.weeks (week_start) values (p_week) on conflict (week_start) do nothing;
  insert into duel.gage_payments (week_start, player_id, paid, updated_at)
  values (p_week, p_player, p_paid, duel.now())
  on conflict (week_start, player_id) do update set paid = excluded.paid, updated_at = excluded.updated_at;
  perform duel.emit(v_me, 'gage_paid', p_week);
end $$;

-- La cérémonie de cette manche a été vue (par le joueur lié). Pas d'événement.
create or replace function public.mark_results_seen(p_week date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := duel.require_player();
begin
  if p_week is null then
    perform duel.fail('Une manche commence un lundi 📅');
  end if;
  insert into duel.seen_results (player_id, week_start) values (v_me, p_week) on conflict do nothing;
end $$;

-- Badges débloqués par le joueur lié ({ badgeId, tier, day }). Doublons ignorés.
-- Seulement les badges de l'app (BADGES de src/core/badges.ts) ; un palier (🪶 Plume : % de
-- perte, > 0 et ≤ 100, au centième) pour Plume seulement ; un jour entre le début du duel (ou
-- sa 1re pesée) et demain (horloge du téléphone un peu en avance) ; 100 lignes au plus par
-- joueur. Rien ne peut faire gonfler le duel de l'autre.
create or replace function public.record_badge_unlocks(p_unlocks jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me    text := duel.require_player();
  v_u     jsonb;
  v_badge text;
  v_tier  numeric;
  v_day   date;
  v_first date;
  v_rows  integer;
  v_added integer := 0;
begin
  if p_unlocks is null or pg_catalog.jsonb_typeof(p_unlocks) <> 'array' or pg_catalog.jsonb_array_length(p_unlocks) > 100 then
    perform duel.fail('Badge invalide 🤔');
  end if;
  select least(s.season_start, (select min(w.day) from duel.weigh_ins w where w.player_id = v_me))
  into v_first from duel.settings s;
  for v_u in select e.value from pg_catalog.jsonb_array_elements(p_unlocks) as e loop
    if pg_catalog.jsonb_typeof(v_u) <> 'object' then
      perform duel.fail('Badge invalide 🤔');
    end if;
    v_badge := duel.text_field(v_u, 'badgeId', 1, 64, 'Badge invalide 🤔');
    if v_badge not in ('manucure', 'zen', 'frigo', 'machine', 'assidu', 'plume', 'remontada', 'royale', 'inarretable') then
      perform duel.fail('Badge invalide 🤔');
    end if;
    -- Palier : un nombre pour Plume, null / absent pour les autres.
    if v_u ? 'tier' and pg_catalog.jsonb_typeof(v_u -> 'tier') not in ('number', 'null') then
      perform duel.fail('Badge invalide 🤔');
    end if;
    v_tier := case when pg_catalog.jsonb_typeof(v_u -> 'tier') = 'number' then (v_u ->> 'tier')::numeric end;
    if (v_badge = 'plume') <> (v_tier is not null)
       or v_tier <= 0 or v_tier > 100 or v_tier <> pg_catalog.round(v_tier, 2) then
      perform duel.fail('Badge invalide 🤔');
    end if;
    v_day := duel.try_date(v_u ->> 'day');
    if v_day is null or v_day < v_first or v_day > duel.today() + 1 then
      perform duel.fail('Badge invalide 🤔');
    end if;
    insert into duel.badge_unlocks (player_id, badge_id, tier, day) values (v_me, v_badge, v_tier, v_day)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_added := v_added + v_rows;
  end loop;
  if (select count(*) from duel.badge_unlocks u where u.player_id = v_me) > 100 then
    perform duel.fail('Badge invalide 🤔');
  end if;
  if v_added > 0 then
    perform duel.emit(v_me, 'badge');
  end if;
end $$;

-- Célébrations de badges vues par le joueur lié (clés libres, 64 caractères maximum). Pas d'événement.
create or replace function public.mark_badges_seen(p_keys text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := duel.require_player();
begin
  if p_keys is null then
    return;
  end if;
  if pg_catalog.cardinality(p_keys) > 500
     or exists (select 1 from pg_catalog.unnest(p_keys) as k(txt) where pg_catalog.char_length(k.txt) > 64) then
    perform duel.fail('Badge invalide 🤔');
  end if;
  insert into duel.seen_badges (player_id, seen_key)
  select v_me, k.txt from pg_catalog.unnest(p_keys) with ordinality as k(txt, pos)
  where k.txt is not null and k.txt <> ''
  order by k.pos
  on conflict do nothing;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. Sécurité : droits et règles d'accès
-- ────────────────────────────────────────────────────────────────────────────

-- Schéma `duel` : fermé à tous (seules les fonctions SECURITY DEFINER y touchent).
revoke all on schema duel from public, anon, authenticated;
revoke all on all tables in schema duel from public, anon, authenticated;
revoke all on all sequences in schema duel from public, anon, authenticated;
revoke all on all functions in schema duel from public, anon, authenticated;

-- public.events : lecture seule, pour les sessions liées à un joueur.
revoke all on table public.events from public, anon, authenticated;
grant select on table public.events to authenticated;
do $$
declare
  v_seq text := pg_catalog.pg_get_serial_sequence('public.events', 'id');
begin
  if v_seq is not null then
    execute pg_catalog.format('revoke all on sequence %s from public, anon, authenticated', v_seq);
  end if;
end $$;
drop policy if exists events_select_linked on public.events;
create policy events_select_linked on public.events
  for select to authenticated
  using ((select public.is_duel_member()));

-- Fonctions de l'app : personne par défaut (Supabase les ouvre à anon), puis les sessions
-- connectées (anonymes comprises : rôle authenticated). L'écran de connexion appelle
-- login_players avant même d'avoir une session.
revoke all on function public.login_players() from public, anon, authenticated;
revoke all on function public.claim_player(text, text) from public, anon, authenticated;
revoke all on function public.change_code(text, text) from public, anon, authenticated;
revoke all on function public.clear_code_failures() from public, anon, authenticated;
revoke all on function public.release_device() from public, anon, authenticated;
revoke all on function public.is_duel_member() from public, anon, authenticated;
revoke all on function public.get_snapshot() from public, anon, authenticated;
revoke all on function public.set_checkin(date, uuid, text) from public, anon, authenticated;
revoke all on function public.save_weigh_in(date, numeric) from public, anon, authenticated;
revoke all on function public.update_profile(jsonb) from public, anon, authenticated;
revoke all on function public.update_habit_look(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.propose(jsonb) from public, anon, authenticated;
revoke all on function public.answer_proposal(uuid, boolean) from public, anon, authenticated;
revoke all on function public.cancel_proposal(uuid) from public, anon, authenticated;
revoke all on function public.set_stake(date, text) from public, anon, authenticated;
revoke all on function public.ensure_stake(date, text) from public, anon, authenticated;
revoke all on function public.set_gages(text[]) from public, anon, authenticated;
revoke all on function public.set_gage_paid(date, text, boolean) from public, anon, authenticated;
revoke all on function public.mark_results_seen(date) from public, anon, authenticated;
revoke all on function public.record_badge_unlocks(jsonb) from public, anon, authenticated;
revoke all on function public.mark_badges_seen(text[]) from public, anon, authenticated;

grant execute on function public.login_players() to anon, authenticated;
grant execute on function public.claim_player(text, text) to authenticated;
grant execute on function public.change_code(text, text) to authenticated;
grant execute on function public.clear_code_failures() to authenticated;
grant execute on function public.release_device() to authenticated;
grant execute on function public.is_duel_member() to authenticated;
grant execute on function public.get_snapshot() to authenticated;
grant execute on function public.set_checkin(date, uuid, text) to authenticated;
grant execute on function public.save_weigh_in(date, numeric) to authenticated;
grant execute on function public.update_profile(jsonb) to authenticated;
grant execute on function public.update_habit_look(uuid, jsonb) to authenticated;
grant execute on function public.propose(jsonb) to authenticated;
grant execute on function public.answer_proposal(uuid, boolean) to authenticated;
grant execute on function public.cancel_proposal(uuid) to authenticated;
grant execute on function public.set_stake(date, text) to authenticated;
grant execute on function public.ensure_stake(date, text) to authenticated;
grant execute on function public.set_gages(text[]) to authenticated;
grant execute on function public.set_gage_paid(date, text, boolean) to authenticated;
grant execute on function public.mark_results_seen(date) to authenticated;
grant execute on function public.record_badge_unlocks(jsonb) to authenticated;
grant execute on function public.mark_badges_seen(text[]) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. Données de départ (src/config/defaults.ts) et règles (src/config/rules.ts)
-- ────────────────────────────────────────────────────────────────────────────
-- Créées une seule fois (on conflict do nothing) : relancer le script ne touche pas à ce
-- que vous avez changé dans l'app. Un test vérifie qu'elles sont égales aux valeurs TypeScript.

-- 🏁 Date de début du duel : le LUNDI de la première manche (SEASON_START) + gages de départ.
insert into duel.settings (id, season_start, gages) values (true, '2026-11-23', array[
  E'Vaisselle pendant une semaine 🍽️',
  E'Offrir un massage de 15 min 💆',
  'Laisser l’autre choisir le film du week-end 🎬',
  'Servir le petit-déj au lit 🥐',
  'Corvée de courses 🛒',
  E'Cuisiner le dîner choisi par l’autre 🧑‍🍳',
  'Ménage de la salle de bain 🧽',
  'Une soirée sans téléphone 📵'
]) on conflict (id) do nothing;

-- Les deux joueurs (DEFAULT_PLAYERS, dans l'ordre d'affichage).
insert into duel.players (id, sort_order, name, emoji, color) values
  ('laetitia', 0, 'Laetitia', '🦊', '#FF6F61'),
  ('arthus',   1, 'Arthus',   '🐻', '#2E6BFF')
on conflict (id) do nothing;

-- Les habitudes de départ (DEFAULT_HABITS), une copie par propriétaire, actives dès la 1re manche.
-- Identifiants fixes (dérivés du joueur et du badge, au format uuid v4) : relancer le script
-- ne les duplique pas.
insert into duel.habits (id, player_id, badge_key, name, hint, emoji, kind, sort_order, active_from)
select overlay(overlay(md5('duel-seed|' || v.player_id || '|' || v.badge_key) placing '4' from 13) placing '8' from 17)::uuid,
       v.player_id, v.badge_key, v.name, v.hint, v.emoji, v.kind, v.sort_order, s.season_start
from (values
  ('laetitia', 'grattage',   'Grattage',   'Ne pas se gratter',          '🦟', 'avoid', 0),
  ('laetitia', 'grignotage', 'Grignotage', 'En dehors des repas',        '🍪', 'avoid', 1),
  ('laetitia', 'sport',      'Sport',      '30 min d’activité minimum',  '🏃', 'do',    2),
  ('arthus',   'ongles',     'Ongles',     'Ne pas se les ronger',       '💅', 'avoid', 0),
  ('arthus',   'grignotage', 'Grignotage', 'En dehors des repas',        '🍪', 'avoid', 1),
  ('arthus',   'sport',      'Sport',      '30 min d’activité minimum',  '🏃', 'do',    2)
) as v (player_id, badge_key, name, hint, emoji, kind, sort_order)
cross join duel.settings s
on conflict (id) do nothing;

-- Les règles (RULES) : recopiées à chaque exécution du script.
insert into duel.rules (
  id, catch_up_days, catch_up_across_weeks, only_on_weigh_in_day, default_weigh_day,
  min_kg, max_kg, stake_editable_days, code_max_failures, code_lock_minutes,
  require_approval, weigh_max_points, full_points_loss_pct, goal_tolerance_pct
) values (
  true,
  1,      -- RULES.checkin.catchUpDays : aujourd'hui et hier
  false,  -- RULES.checkin.catchUpAcrossWeeks : le lundi, le dimanche est clos
  true,   -- RULES.weighIn.onlyOnWeighInDay
  7,      -- RULES.weighIn.defaultDay : dimanche
  30,     -- RULES.weighIn.minKg
  250,    -- RULES.weighIn.maxKg
  1,      -- RULES.stake.editableDays : le lundi seulement
  10,     -- 10 codes faux…
  15,     -- … en 15 minutes → il faut attendre (décision 20)
  true,   -- RULES.proposals.requireApproval : l'autre doit accepter
  100,    -- RULES.weighIn.maxPoints
  1,      -- RULES.weighIn.fullPointsLossPct
  1       -- RULES.weighIn.goalTolerancePct
)
on conflict (id) do update set
  catch_up_days = excluded.catch_up_days,
  catch_up_across_weeks = excluded.catch_up_across_weeks,
  only_on_weigh_in_day = excluded.only_on_weigh_in_day,
  default_weigh_day = excluded.default_weigh_day,
  min_kg = excluded.min_kg,
  max_kg = excluded.max_kg,
  stake_editable_days = excluded.stake_editable_days,
  code_max_failures = excluded.code_max_failures,
  code_lock_minutes = excluded.code_lock_minutes,
  require_approval = excluded.require_approval,
  weigh_max_points = excluded.weigh_max_points,
  full_points_loss_pct = excluded.full_points_loss_pct,
  goal_tolerance_pct = excluded.goal_tolerance_pct;

-- PostgREST relit la liste des fonctions tout de suite.
notify pgrst, 'reload schema';
