# 🥊 Duel des Défauts

Une petite app perso (PWA) pour le duel d’habitudes entre Laetitia et Arthus.
Le cahier des charges est dans [SPEC.md](SPEC.md).

## Mise en route Supabase

Supabase garde les données du duel (check-ins, pesées, manches…) et fait le temps réel.
Il n’y a **pas de compte à créer** dans l’app : chacun touche son prénom et choisit un
code à 6 chiffres. Compte une quinzaine de minutes, une seule fois.

### 1. Créer le projet

1. Va sur [supabase.com](https://supabase.com), connecte-toi (avec GitHub, c’est le plus simple),
   puis **New project**.
2. Remplis :
   - **Name** : `duel-des-defauts` ;
   - **Database Password** : clique sur *Generate a password* et range-le dans ton
     gestionnaire de mots de passe (l’app n’en a pas besoin, mais Supabase le demande) ;
   - **Region** : **West EU (Paris)** ;
   - offre **Free** ; laisse les options de sécurité par défaut (Data API activée, schéma `public`).
3. **Create new project**, puis attends une minute que le projet soit prêt.

### 2. Lancer le script SQL

1. Dans le menu de gauche : **SQL Editor** › **New query**.
2. Ouvre le fichier [`supabase/migrations/0001_duel.sql`](supabase/migrations/0001_duel.sql)
   de ce dépôt, copie **tout** son contenu et colle-le dans l’éditeur.
3. **Run**. Résultat attendu : *Success. No rows returned*.

Le script crée les tables, les fonctions de l’app, le journal temps réel, Laetitia, Arthus,
leurs habitudes et la liste des gages. On peut le relancer sans risque : il n’efface rien.

> Le duel commence le **lundi 23 novembre 2026** (pesée de départ le dimanche 22).
> Pour changer la date avant la première manche, voir l’en-tête du script SQL.

### 3. Autoriser les connexions anonymes (obligatoire)

Chaque téléphone ouvre une session anonyme, puis la lie à un joueur grâce au code.

1. **Authentication** › **Sign In / Providers**.
2. Active **Allow anonymous sign-ins**, puis **Save changes**.

CAPTCHA (*Authentication* › *Attack Protection*) : pas nécessaire pour nous, laisse-le désactivé.
Les fonctions du serveur refusent tout téléphone qui n’a pas donné le bon code, et un prénom
est bloqué 15 minutes après 10 codes faux.

### 3 bis. Poser vos deux codes tout de suite (conseillé)

Tant qu’un prénom n’a pas de code, le premier code tapé pour lui devient le sien : quelqu’un
qui tomberait sur l’adresse de l’app avant vous pourrait le prendre. Le plus sûr : choisissez
chacun un code à 6 chiffres et posez-les dès maintenant dans **SQL Editor** › **New query** :

```sql
select duel.reset_code('laetitia', '135790');  -- le code de Laetitia
select duel.reset_code('arthus',   '482916');  -- le code d’Arthus
```

(Remplacez les chiffres, évidemment.) Sur le téléphone, on tape alors ce code directement.
Vous pourrez le changer ensuite dans l’app : *Réglages* › *Mon compte* › *Changer mon code*.

### 4. Copier l’URL et la clé dans Vercel

1. Dans Supabase, bouton **Connect** en haut de la page du projet (ou *Project Settings* ›
   *Data API* et *Project Settings* › *API Keys*). Copie :
   - le **Project URL**, du genre `https://abcdefghijklmnop.supabase.co` ;
   - la **Publishable key**, qui commence par `sb_publishable_`.
2. Dans Vercel : ton projet › **Settings** › **Environment Variables**. Ajoute ces deux
   variables, en cochant *Production* et *Preview* :

   | Nom | Valeur |
   | --- | --- |
   | `VITE_SUPABASE_URL` | le Project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | la Publishable key |

3. **Redéploie** : *Deployments* › le dernier déploiement › **⋯** › **Redeploy**. Les
   variables sont lues au moment du build : sans redéploiement, l’app affiche
   *« L’app n’est pas encore branchée à ta base »* (voir *En cas de souci*).
4. Vérifie : l’app montre ton écran de connexion, **sans** la pastille
   *🧪 Maquette · données inventées*. Dans *Réglages*, tout en bas : *🔌 Branchée à
   Supabase · xxxx.supabase.co* et la date de la version.

L’URL, c’est juste `https://xxxx.supabase.co` (`.co`, pas `.com`) : si tu as copié
`…/rest/v1` à la fin, ou oublié `https://` devant, l’app corrige toute seule.

⚠️ La clé publishable est publique par nature (elle finit dans l’app). Ne mets **jamais**
la clé *secret* (`sb_secret_…`) ni *service_role*, ni la chaîne de connexion de la base
(`postgresql://…` avec le mot de passe), ni dans Vercel ni dans le code.

### 5. En local (facultatif)

```bash
cp .env.example .env    # puis colle les deux mêmes valeurs dans .env
npm install
npm run dev             # http://localhost:5173 (et l’adresse réseau pour le téléphone)
```

Le fichier `.env` n’est jamais versionné (il est dans `.gitignore`).

### 6. Premier lancement

1. Ouvre l’adresse Vercel sur ton téléphone.
2. **Qui es-tu ?** › touche ton avatar.
3. Tape ton code (celui de l’étape 3 bis). Si tu ne l’as pas posé à l’avance : **Choisis ton
   code secret**, 6 chiffres, puis **Confirme-le** ; ce tout premier code devient le tien
   (faites-le tous les deux juste après avoir lancé le script). Le téléphone s’en souvient ensuite.
4. Laetitia fait pareil sur son téléphone, avec son propre code.

Un 2ᵉ appareil (tablette, ordi) : on tape le même code, les deux restent connectés.
Pour changer de code : *Réglages* › *Mon compte* › *Changer mon code*. Le téléphone qui
change le code reste connecté ; **tes autres appareils sont déconnectés** et devront taper
le nouveau code (pratique si quelqu’un a vu l’ancien).

Si le téléphone ne joint pas le serveur au démarrage (métro, projet en pause…), il reste
sur l’écran d’attente avec un bouton **Réessayer** : pas besoin de retaper son code.

### Code oublié (ou vu par quelqu’un)

Dans Supabase › **SQL Editor**, lance cette ligne (avec le bon prénom et un nouveau code à
6 chiffres) :

```sql
select duel.reset_code('arthus', '482916');  -- ou 'laetitia'
```

Ce code devient le sien, et **tous ses téléphones sont déconnectés** : chacun retape le
nouveau code (personne d’autre ne peut le « prendre » entre-temps).

### Prénom bloqué (« Trop de codes faux »)

Après 10 codes faux en 15 minutes, le prénom est bloqué sur l’écran de connexion, même avec
le bon code. Depuis un téléphone déjà connecté : *Réglages* › *Mon compte* › **Débloquer mon
prénom** (l’app dit combien de codes faux ont été tapés : si ce n’était pas vous, changez de
code). Sinon, dans le SQL Editor : `delete from duel.code_failures where player_id = 'arthus';`

### 🔄 Mettre à jour la base

Quand l’app change (nouvelle règle, correctif), la base suit en relançant **le même script
qu’à l’étape 2** : Supabase › **SQL Editor** › **New query**, colle **tout**
[`supabase/migrations/0001_duel.sql`](supabase/migrations/0001_duel.sql) (sur GitHub :
*Copy raw file*), **Run**. Résultat attendu : *Success. No rows returned*.

C’est sans risque : il met à jour les fonctions et les règles, et ne touche **à aucune de vos
données** (check-ins, pesées, habitudes, codes, téléphones connectés…). Personne n’a à retaper
son code. Quand une mise à jour doit aussi changer vos données, elle a son petit script à
lancer **juste après**, décrit ci-dessous.

#### 🍪 Grignotage « tout ou rien » (16 novembre 2026)

Décidé par Arthus (précision 22 du [SPEC.md](SPEC.md)) : sur Grignotage, plus de « 😬 Un peu »,
seulement « 😇 Nickel » (10 pts) ou « 🙈 Craquage » (0 pt), pour Laetitia **et** Arthus, dès
aujourd’hui. Ongles, Grattage et Sport ne changent pas.

**Dans cet ordre : l’app d’abord, la base ensuite.**

0. **La nouvelle version de l’app, sur les deux téléphones.** Dans Vercel › *Deployments*,
   le déploiement de cette version (le dernier commit poussé sur GitHub) doit être *Ready*.
   Puis, sur **chaque** téléphone (et tablette…), ferme complètement l’app (balaye-la hors des
   apps ouvertes) et rouvre-la : en bas des *Réglages*, la *Version du …* doit être celle de
   ce déploiement (même date, même commit que dans Vercel). Une app restée à l’ancienne
   version ne saurait plus remplir Grignotage une fois la base passée en tout ou rien : elle
   afficherait 💪 Fait / 🛋️ Pas fait, et la base refuserait ces réponses.
1. Relance `supabase/migrations/0001_duel.sql` **en entier** (juste au-dessus).
2. **New query** : colle **tout**
   [`supabase/grignotage-tout-ou-rien.sql`](supabase/grignotage-tout-ou-rien.sql), puis **Run**.
3. Résultat attendu : *« ✅ Grignotage : Nickel ou Craquage, pour Laetitia et Arthus »*.

Un « Un peu » déjà noté (même ce soir) garde ses 5 pts : on ne peut simplement plus en choisir
de nouveau. Un téléphone qui a la nouvelle version (étape 0) passe en tout ou rien tout seul,
sans notification : tout de suite si l’app est ouverte, sinon dès qu’on y revient. Si un
téléphone affiche quand même 💪 Fait / 🛋️ Pas fait sur Grignotage, il a gardé l’ancienne
version : ferme complètement l’app et rouvre-la. On peut relancer le script sans risque. S’il
répond *« Relance d’abord supabase/migrations/0001_duel.sql en entier… »*, c’est que l’étape 1
manque : rien n’a été changé, fais-la puis relance-le.

### 🧹 Tout remettre à zéro

> **Tu vois une « Manche 4 », ou des points que personne n’a marqués ?** Ce n’est pas ta
> base : c’est la maquette (données inventées), et ta base est encore vide. Ce script n’y
> changera rien : va d’abord à l’étape 4 (variables sur Vercel, puis **Redeploy**). En bas
> des *Réglages*, tu dois lire *🔌 Branchée à Supabase · xxxx.supabase.co*.

Pour repartir sur un duel tout propre : après des essais, ou pour changer la date de début.
Pas besoin de relancer le gros script de l’étape 2 (sauf si le script le demande : ta base date
alors d’une version d’avant, voir *Mettre à jour la base*). Ce script remet Grignotage en
« tout ou rien » : les téléphones doivent déjà avoir une version de l’app qui le connaît
(étape 0 de *Grignotage « tout ou rien »*, juste au-dessus).

1. Ouvre le fichier [`supabase/remise-a-zero.sql`](supabase/remise-a-zero.sql) de ce dépôt
   et copie **tout** son contenu (sur GitHub : bouton *Copy raw file*).
2. Supabase › **SQL Editor** › **New query** : colle tout.
3. Si besoin, change la date de début **dans l’éditeur de Supabase** : c’est la ligne qui
   suit *« 🏁 DATE DE DÉBUT DU DUEL »* (vers la ligne 39, après les explications). Toujours
   un **lundi**, cette semaine ou plus tard, écrit année-mois-jour entre les apostrophes. Par
   exemple, pour commencer dès ce lundi 16 novembre :

   ```sql
   date_de_debut constant text := '2026-11-16';
   ```

   Sinon, laisse `'2026-11-23'` (le lundi 23 novembre 2026).
4. **Run**. Si Supabase prévient que la requête efface des données, confirme : c’est le but.
5. Résultat attendu : une ligne *« ✅ Tout est remis à zéro ! Le duel commence le lundi… »*,
   avec le jour de la pesée de départ. Si un message d’erreur s’affiche à la place (une date
   qui n’est pas un lundi, par exemple), **rien n’a été effacé** : recopie la date qu’il
   propose (déjà au bon format, par exemple `2026-11-23`) et relance.

| Effacé | Gardé |
| --- | --- |
| Check-ins, pesées (celle de départ aussi), poids objectifs | Laetitia et Arthus : prénom, emoji, couleur, « montrer mes kilos » |
| Propositions (en attente comprises), manches, enjeux, gages payés | Vos codes et les téléphones déjà connectés : personne ne retape son code |
| Badges, cérémonies déjà vues, codes faux | La liste des gages de la roulette 🎲 |

Les habitudes reviennent à celles de départ (noms, emojis, ordre, types) et la pesée au
dimanche. Les téléphones où l’app est ouverte se mettent à jour tout seuls, sans notification ;
les autres, dès qu’on revient dans l’app. On peut relancer le script sans risque.

Si vous commencez dès ce lundi, le dimanche d’avant est passé : la première pesée (dimanche
prochain) sert de point de départ et ne rapporte de points à personne cette semaine-là.

Ce script ne touche qu’à la base : si l’app montre la pastille *🧪 Maquette · données
inventées* (sur les écrans comme sur les notifications), c’est la maquette, pas votre duel.
Voir l’étape 4.

### Voir la maquette

Ajoute `?demo` à l’adresse (ex. `https://ton-app.vercel.app/?demo`) : l’app tourne avec des
données de démo (3 semaines fictives) et ne touche pas à la base. Une pastille
*🧪 Maquette · données inventées* est alors en haut de chaque écran, et *Réglages* › *Démo* ›
**Quitter la maquette** ramène à la vraie app. En local sans `.env`, l’app démarre aussi en
maquette ; sur le site déployé, jamais en douce : sans les variables, elle affiche
*« pas encore branchée »*.

### En cas de souci

- *« La base n’est pas prête »* : le script SQL n’a pas été lancé (étape 2).
- *« Active Allow anonymous sign-ins »* : étape 3.
- *« Impossible de joindre le serveur »* : pas de réseau, projet Supabase en pause
  (l’offre gratuite se met en pause après une semaine sans activité : *Restore project*
  dans Supabase), **ou adresse fausse** dans `VITE_SUPABASE_URL` sur Vercel. L’écran affiche
  le *Serveur utilisé* : ce doit être ton Project URL, qui finit par `.supabase.co` (pas
  `.com`). Corrige la variable, puis **Redeploy** (étape 4).
- *« Clé Supabase refusée »* : la variable `VITE_SUPABASE_PUBLISHABLE_KEY` (ou l’URL) est
  fausse sur Vercel : recopie la **Publishable key** (`sb_publishable_…`, jamais la *secret*),
  puis **Redeploy** (étape 4).
- *« Le serveur a répondu une erreur »* : relance le script SQL (étape 2, voir *Mettre à jour la
  base*), il ne casse rien.
- *« 🔌 L’app n’est pas encore branchée à ta base »* : le site déployé n’a pas reçu
  l’URL ou la clé. L’écran dit laquelle manque (✅ / ❌, les noms seulement). Le plus
  souvent : les variables ont été ajoutées **sans redéployer**, ou leur nom diffère un peu.
  Vérifie les noms dans Vercel › *Settings* › *Environment Variables* (bouton *Copier le nom*
  sur l’écran), puis *Deployments* › **⋯** › **Redeploy** (étape 4), et touche
  **J’ai redéployé : recharger**. Si l’URL est *reçue mais pas la bonne*, l’écran dit ce qui
  cloche (adresse de la base, du tableau de bord, `.com` au lieu de `.co`).
  - L’app accepte aussi les noms que proposent Supabase (bouton *Connect*) et l’intégration
    Supabase de Vercel. Pour l’URL : `VITE_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL`. Pour
    la clé : `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`,
    `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` (s’il y
    en a plusieurs, dans cet ordre). Rien d’autre n’est lu : `SUPABASE_SERVICE_ROLE_KEY`,
    `POSTGRES_…` et les autres variables serveur de l’intégration restent hors de l’app.
  - Pour savoir si le redéploiement a eu lieu : l’écran affiche *« Version du 16 novembre
    à 14:32 »* (heure de Paris), qui change à chaque déploiement. On la retrouve ensuite en
    bas des *Réglages*.
- *« 🚨 Stop : c’est la clé secrète ! »* : la clé collée dans Vercel est la *secret*
  (`sb_secret_…`) ou l’ancienne *service_role* (même entourée de guillemets, précédée de
  « Bearer »…). Elle a été publiée dans l’app, donc **tout de suite** : supprime la variable
  sur Vercel, régénère la clé secrète dans Supabase › *Project Settings* › *API Keys*, mets la
  **Publishable key** à la place, puis **Redeploy**. L’app refuse de démarrer tant que cette
  clé est là (même avec `?demo`).
- *« 🚨 Stop : c’est le mot de passe de la base ! »* : `VITE_SUPABASE_URL` contient la chaîne
  de connexion de la base (`postgresql://postgres:mot-de-passe@…`), publiée dans l’app.
  **Tout de suite** : supprime la variable sur Vercel, change le mot de passe dans Supabase ›
  *Project Settings* › *Database* › *Reset database password*, remets le **Project URL**
  (`https://xxxx.supabase.co`) dans `VITE_SUPABASE_URL`, puis **Redeploy**.
- Une pastille *🧪 Maquette · données inventées* en haut de l’écran (ou sous une
  notification) : c’est la maquette (adresse avec `?demo`), pas votre duel. Enlève `?demo` de l’adresse, ou *Réglages* › *Démo* ›
  **Quitter la maquette**.
- Le *Security Advisor* de Supabase signale « RLS enabled, no policy » sur les tables du
  schéma `duel` : c’est voulu, l’app passe uniquement par les fonctions du serveur.
