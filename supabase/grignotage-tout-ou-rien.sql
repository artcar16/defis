-- ════════════════════════════════════════════════════════════════════════════
-- 🍪 Duel des Défauts — Grignotage en « tout ou rien »
-- ════════════════════════════════════════════════════════════════════════════
--
-- À quoi sert ce script ?
--   Décidé par Arthus le 16/11/2026 (précision 22 de SPEC.md) : sur Grignotage, plus de
--   « 😬 Un peu ». Seulement « 😇 Nickel » (10 pts) ou « 🙈 Craquage » (0 pt), pour Laetitia
--   ET Arthus, dès aujourd'hui, sans passer par une proposition.
--   - Il passe en « tout ou rien » le Grignotage en cours de chacun (la même habitude :
--     séries, badges et historique continuent).
--   - Il ne touche à aucun check-in : un « Un peu » déjà noté (même aujourd'hui) garde ses
--     5 pts ; on ne peut simplement plus en choisir un nouveau.
--   - Ongles, Grattage et Sport ne changent pas.
--
-- Comment le lancer ? DANS CET ORDRE (README, « Grignotage tout ou rien ») :
--   0. D'ABORD l'app : la nouvelle version déployée sur Vercel (Deployments : Ready), puis
--      sur CHAQUE téléphone, l'app fermée complètement et rouverte (Réglages, tout en bas :
--      « Version du … » = ce déploiement). Une app restée à l'ancienne version ne saurait
--      plus remplir Grignotage (elle afficherait Fait / Pas fait, refusés par la base).
--   1. Relance supabase/migrations/0001_duel.sql EN ENTIER (SQL Editor › New query, colle
--      tout, Run). Sans risque : il n'efface rien.
--   2. Puis, dans une nouvelle requête : colle TOUT ce fichier, Run.
--   Résultat attendu : « ✅ Grignotage : Nickel ou Craquage, pour Laetitia et Arthus ».
--
-- Un téléphone qui a la nouvelle version passe en tout ou rien tout seul, sans notification
-- (tout de suite si l'app est ouverte). On peut relancer ce script sans risque (la 2e fois,
-- il ne change plus rien). Il n'ajoute rien qu'un téléphone pourrait appeler : il ne marche
-- que depuis le SQL Editor. Tests : src/data/supabase/upgrade.test.ts.
-- ════════════════════════════════════════════════════════════════════════════

do $grignotage$
declare
  v_changes integer;
  v_joueur  text;
begin
  -- 0. La base doit connaître le « tout ou rien » (0001_duel.sql relancé) : sinon on s'arrête
  --    avant de toucher à quoi que ce soit.
  if pg_catalog.to_regclass('duel.habits') is null
     or pg_catalog.to_regprocedure('duel.checkin_values(text)') is null
     or not exists (select 1 from pg_catalog.pg_constraint c
                    where c.conrelid = pg_catalog.to_regclass('duel.habits') and c.conname = 'habits_kind_check'
                      and pg_catalog.pg_get_constraintdef(c.oid) like '%avoid_strict%') then
    raise exception using message =
      'Relance d’abord supabase/migrations/0001_duel.sql en entier (SQL Editor › New query › tout coller › Run), puis ce script. Rien n’a été changé.';
  end if;

  -- 1. Le Grignotage en cours de chacun (pas un ancien, déjà clos) passe en tout ou rien.
  update duel.habits h set kind = 'avoid_strict'
  where h.badge_key = 'grignotage' and h.kind = 'avoid'
    and (h.active_until is null or h.active_until > duel.today());
  get diagnostics v_changes = row_count;

  -- 2. Les téléphones ouverts relisent le duel. 'gages' fait seulement relire, sans
  --    notification (comme remise-a-zero.sql). Rien à dire si rien n'a changé.
  if v_changes > 0 then
    select p.id into v_joueur from duel.players p order by p.sort_order, p.id limit 1;
    perform duel.emit(v_joueur, 'gages');
  end if;
end
$grignotage$;

-- Le résultat affiché dans le SQL Editor (seulement si tout s'est bien passé).
select case
         when pg_catalog.count(*) filter (where g.ok) = 0
           then '⚠️ Aucun Grignotage en cours à passer en tout ou rien : rien n’a changé.'
         else '✅ Grignotage : Nickel ou Craquage, pour '
              || pg_catalog.string_agg(g.name, ' et ' order by g.sort_order) filter (where g.ok)
              || coalesce('. ⚠️ Pas de Grignotage en cours pour '
                          || pg_catalog.string_agg(g.name, ' et ' order by g.sort_order) filter (where not g.ok)
                          || ' : rien n’a changé de ce côté.', '')
       end as "Résultat"
from (
  select p.name, p.sort_order,
         exists (select 1 from duel.habits h
                 where h.player_id = p.id and h.badge_key = 'grignotage' and h.kind = 'avoid_strict'
                   and (h.active_until is null or h.active_until > duel.today())) as ok
  from duel.players p
) g;
