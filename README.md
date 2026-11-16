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
   variables sont lues au moment du build : sans redéploiement, l’app reste en maquette.

L’URL, c’est juste `https://xxxx.supabase.co` : si tu as copié `…/rest/v1` à la fin, l’app
l’enlève toute seule.

⚠️ La clé publishable est publique par nature (elle finit dans l’app). Ne mets **jamais**
la clé *secret* (`sb_secret_…`) ni *service_role*, ni dans Vercel ni dans le code.

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

### Voir la maquette

Ajoute `?demo` à l’adresse (ex. `https://ton-app.vercel.app/?demo`) : l’app tourne avec des
données de démo (3 semaines fictives) et ne touche pas à la base. Sans les deux variables
d’environnement, l’app démarre aussi en maquette.

### En cas de souci

- *« La base n’est pas prête »* : le script SQL n’a pas été lancé (étape 2).
- *« Active Allow anonymous sign-ins »* : étape 3.
- *« Impossible de joindre le serveur »* : pas de réseau, ou projet Supabase en pause
  (l’offre gratuite se met en pause après une semaine sans activité) : *Restore project*
  dans Supabase.
- *« Clé Supabase refusée »* : la variable `VITE_SUPABASE_PUBLISHABLE_KEY` (ou l’URL) est
  fausse sur Vercel : recopie la **Publishable key** (`sb_publishable_…`, jamais la *secret*),
  puis **Redeploy** (étape 4).
- *« Le serveur a répondu une erreur »* : relance le script SQL (étape 2), il ne casse rien.
- L’app reste en maquette sur Vercel : variables mal nommées, ou pas de redéploiement (étape 4).
- Le *Security Advisor* de Supabase signale « RLS enabled, no policy » sur les tables du
  schéma `duel` : c’est voulu, l’app passe uniquement par les fonctions du serveur.
