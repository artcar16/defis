-- ════════════════════════════════════════════════════════════════════════════
-- 🧹 Duel des Défauts — tout remettre à zéro
-- ════════════════════════════════════════════════════════════════════════════
--
-- À quoi sert ce script ?
--   À repartir sur un duel tout propre (après des essais, par exemple), sans relancer le
--   gros script 0001_duel.sql :
--   - il EFFACE tout ce qui s'est passé : check-ins, pesées, poids objectifs, propositions,
--     manches et enjeux, gages payés, badges, cérémonies vues, codes faux, journal du temps
--     réel ;
--   - il REMET les règles de départ : les habitudes d'origine (noms, emojis, ordre, types),
--     la pesée le dimanche, et la date de début choisie juste en dessous ;
--   - il GARDE Laetitia et Arthus (prénom, emoji, couleur, « montrer mes kilos »), leurs
--     codes, les téléphones déjà connectés (personne n'a à retaper son code) et la liste des
--     gages de la roulette 🎲.
--
-- Comment le lancer ?
--   1. Supabase › ton projet › SQL Editor › « New query ».
--   2. Colle TOUT ce fichier dans l'éditeur.
--   3. Si besoin, change la date de début DANS L'ÉDITEUR : c'est la ligne « date_de_debut »,
--      juste sous « 🏁 DATE DE DÉBUT DU DUEL », après ces explications (vers la ligne 39).
--      Un LUNDI, cette semaine ou plus tard, écrit année-mois-jour entre les apostrophes.
--      Exemple pour commencer dès le lundi 16 novembre 2026 : '2026-11-16'.
--   4. « Run ». Si Supabase prévient que la requête efface des données (« destructive
--      operation »), confirme : c'est le but.
--   Résultat attendu : une ligne « ✅ Tout est remis à zéro ! Le duel commence le lundi … ».
--   Si un message d'erreur s'affiche à la place (date qui n'est pas un lundi…), RIEN n'a été
--   effacé : corrige la date comme le message le propose, et relance.
--
-- Il suppose 0001_duel.sql déjà lancé, et l'app des téléphones à jour (README, étape 0 de
-- « Grignotage tout ou rien »). Les téléphones ouverts se mettent alors à jour tout seuls,
-- sans notification ; les autres, dès qu'on revient dans l'app. On peut le relancer sans
-- risque. Rien d'appelable par un téléphone : il ne marche que depuis le SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

do $remise$
declare
  -- 🏁 DATE DE DÉBUT DU DUEL (le lundi de la première manche) : la seule ligne à modifier.
  date_de_debut constant text := '2026-11-23';

  v_debut   date;
  v_semaine date;
  v_joueur  text;
  v_jours   constant text[] := array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  v_mois    constant text[] := array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                                     'septembre', 'octobre', 'novembre', 'décembre'];
  v_lundis  date[];
  v_idees   text;
  v_refusee text;
begin
  -- ─── 0. Vérifications : en cas de problème, on s'arrête AVANT d'effacer quoi que ce soit ───

  if pg_catalog.to_regclass('duel.settings') is null or pg_catalog.to_regclass('public.events') is null then
    raise exception using message =
      'Lance d’abord le script supabase/migrations/0001_duel.sql (étape 2 du README), puis celui-ci. Rien n’a été effacé.';
  end if;
  if (select count(*) from duel.players p where p.id in ('laetitia', 'arthus')) <> 2
     or not exists (select 1 from duel.settings) then
    raise exception using message =
      'Il manque des données de départ : relance d’abord le script supabase/migrations/0001_duel.sql, puis celui-ci. Rien n’a été effacé.';
  end if;

  -- Une base d'une version d'avant ne connaît pas Grignotage « tout ou rien » (précision 22) :
  -- il faut d'abord relancer 0001_duel.sql (sinon les habitudes de départ seraient refusées).
  if pg_catalog.to_regprocedure('duel.checkin_values(text)') is null
     or not exists (select 1 from pg_catalog.pg_constraint c
                    where c.conrelid = pg_catalog.to_regclass('duel.habits') and c.conname = 'habits_kind_check'
                      and pg_catalog.pg_get_constraintdef(c.oid) like '%avoid_strict%') then
    raise exception using message =
      'Ta base date d’une version d’avant : relance d’abord le script supabase/migrations/0001_duel.sql en entier, puis celui-ci. Rien n’a été effacé.';
  end if;

  -- La date : une vraie date, un lundi, pas avant cette semaine (heure de Paris).
  v_debut := duel.try_date(pg_catalog.btrim(date_de_debut));
  if v_debut is null then
    raise exception using message = pg_catalog.format(
      '« %s » n’est pas une date : écris-la année-mois-jour, par exemple 2026-11-23. Rien n’a été effacé.',
      date_de_debut);
  end if;
  v_semaine := duel.week_start(duel.today());
  if duel.iso_day(v_debut) <> 1 or v_debut < v_semaine then
    -- Les lundis à proposer, écrits COMME ON DOIT LES TAPER (2026-11-23), suivis du jour en
    -- toutes lettres : on peut les recopier tels quels sur la ligne de la date.
    v_lundis := case
      when duel.iso_day(v_debut) = 1 then array[v_semaine]
      when duel.week_start(v_debut) >= v_semaine then array[duel.week_start(v_debut), duel.next_monday(v_debut)]
      else array[greatest(duel.next_monday(v_debut), v_semaine)] end;
    select pg_catalog.string_agg(
             pg_catalog.to_char(u.jour, 'YYYY-MM-DD') || ' (lundi '
             || case extract(day from u.jour)::integer when 1 then '1er' else extract(day from u.jour)::integer::text end
             || ' ' || v_mois[extract(month from u.jour)::integer] || ')',
             ' ou ' order by u.n)
      into v_idees
      from pg_catalog.unnest(v_lundis) with ordinality as u (jour, n);
    -- La date refusée, en toutes lettres (« 17 novembre 2026 »).
    v_refusee := case extract(day from v_debut)::integer when 1 then '1er' else extract(day from v_debut)::integer::text end
                    || ' ' || v_mois[extract(month from v_debut)::integer] || ' ' || extract(year from v_debut)::integer;
    if duel.iso_day(v_debut) <> 1 then
      raise exception using message = pg_catalog.format(
        'Le %s est un %s : il faut un lundi, par exemple %s. Rien n’a été effacé.',
        v_refusee, v_jours[duel.iso_day(v_debut)], v_idees);
    end if;
    raise exception using message = pg_catalog.format(
      'Le lundi %s est déjà passé : choisis le lundi de cette semaine, %s, ou un lundi suivant. Rien n’a été effacé.',
      v_refusee, v_idees);
  end if;

  -- ─── 1. On efface tout l'historique du jeu (les tables « enfants » avant leurs « parents ») ───

  delete from duel.checkins;        -- check-ins
  delete from duel.weigh_ins;       -- pesées
  delete from duel.goals;           -- poids objectifs
  delete from duel.proposal_goals;  -- kilos privés des propositions d'objectif
  delete from duel.proposals;       -- propositions (acceptées, refusées, en attente)
  delete from duel.gage_payments;   -- « Gage payé ✅ »
  delete from duel.weeks;           -- manches et enjeux
  delete from duel.seen_results;    -- cérémonies de fin de manche déjà vues
  delete from duel.badge_unlocks;   -- badges gravés
  delete from duel.seen_badges;     -- célébrations de badges déjà vues
  delete from duel.code_failures;   -- codes faux (et donc les prénoms bloqués)
  delete from duel.weigh_days;      -- jour de pesée : retour au jour par défaut (le dimanche)
  delete from duel.habits;          -- habitudes (remises juste en dessous)
  delete from public.events;        -- journal du temps réel

  -- ─── 2. Les règles de départ ───

  -- Les habitudes de départ : les MÊMES que la section 7 de 0001_duel.sql (mêmes identifiants,
  -- noms, emojis, ordre et types), actives dès la date de début. Un test vérifie la parité.
  insert into duel.habits (id, player_id, badge_key, name, hint, emoji, kind, sort_order, active_from)
  select overlay(overlay(md5('duel-seed|' || v.player_id || '|' || v.badge_key) placing '4' from 13) placing '8' from 17)::uuid,
         v.player_id, v.badge_key, v.name, v.hint, v.emoji, v.kind, v.sort_order, v_debut
  from (values
    ('laetitia', 'grattage',   'Grattage',   'Ne pas se gratter',          '🦟', 'avoid', 0),
    ('laetitia', 'grignotage', 'Grignotage', 'En dehors des repas',        '🍪', 'avoid_strict', 1),
    ('laetitia', 'sport',      'Sport',      '30 min d’activité minimum',  '🏃', 'do',    2),
    ('arthus',   'ongles',     'Ongles',     'Ne pas se les ronger',       '💅', 'avoid', 0),
    ('arthus',   'grignotage', 'Grignotage', 'En dehors des repas',        '🍪', 'avoid_strict', 1),
    ('arthus',   'sport',      'Sport',      '30 min d’activité minimum',  '🏃', 'do',    2)
  ) as v (player_id, badge_key, name, hint, emoji, kind, sort_order);

  -- La date de début. La liste des gages, elle, est gardée (réglage libre, décision 6).
  update duel.settings set season_start = v_debut;

  -- Gardés tels quels : duel.players, duel.codes, duel.devices (téléphones connectés) et
  -- duel.rules (copie de src/config/rules.ts, remise par 0001_duel.sql).

  -- ─── 3. Les téléphones ouverts relisent le duel tout de suite ───
  -- Une ligne dans le journal du temps réel. 'gages' fait seulement relire le duel, sans
  -- notification (EventKind de src/data/supabase/api.ts) : pas de « Laetitia a fait… ».
  select p.id into v_joueur from duel.players p order by p.sort_order, p.id limit 1;
  perform duel.emit(v_joueur, 'gages');
end
$remise$;

-- Le résultat affiché dans le SQL Editor (seulement si tout s'est bien passé).
select pg_catalog.format(
         '✅ Tout est remis à zéro ! Le duel commence le %s %s (pesée de départ : %s). %s',
         f.texte[1], extract(year from d.debut)::integer, f.texte[2],
         case d.telephones
           when 0 then 'Aucun téléphone connecté pour l’instant : chacun tapera son code à la première ouverture.'
           when 1 then '1 téléphone reste connecté : pas besoin de retaper son code.'
           else d.telephones || ' téléphones restent connectés : personne n’a à retaper son code.' end
       ) as "Résultat"
from (
  -- Pesée de départ : le jour de pesée de la semaine d'avant, sinon (déjà passé) celui de la 1re manche.
  select s.season_start as debut,
         case when s.season_start - 7 + (r.default_weigh_day - 1) >= duel.today()
              then s.season_start - 7 + (r.default_weigh_day - 1)
              else s.season_start + (r.default_weigh_day - 1) end as pesee,
         (select count(*) from duel.devices)::integer as telephones
  from duel.settings s cross join duel.rules r
) d
cross join lateral (
  -- « lundi 23 novembre », « dimanche 1er décembre ».
  select pg_catalog.array_agg(
           (array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])[duel.iso_day(u.jour)]
           || ' ' || case extract(day from u.jour)::integer when 1 then '1er'
                       else extract(day from u.jour)::integer::text end
           || ' ' || (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                            'septembre', 'octobre', 'novembre', 'décembre'])[extract(month from u.jour)::integer]
           order by u.n) as texte
  from pg_catalog.unnest(array[d.debut, d.pesee]) with ordinality as u (jour, n)
) f;
