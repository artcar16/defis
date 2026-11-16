# 🥊 Duel des Défauts — Cahier des charges

> Document de référence du projet. **Toute règle modifiée doit être mise à jour ici.**
> Version initiale : 16 novembre 2026. Voir le [journal des modifications](#journal-des-modifications) en bas.

## Contexte

Une petite app perso pour un duel entre **Laetitia** et **Arthus**. On est ultra compétitifs et on a chacun nos mauvaises habitudes : Arthus se ronge les ongles, Laetitia se gratte, et on grignote tous les deux. On veut aussi faire du sport et perdre un peu de poids.

Le principe : chaque jour, on fait un check-in de nos habitudes ; chaque semaine, on se pèse. L'app désigne un gagnant chaque semaine, et le perdant a un gage.

Priorités, dans l'ordre :

1. **Ultra simple** : le check-in du jour prend moins de 15 secondes.
2. **Très visuel et drôle** : ça doit donner envie de l'ouvrir.
3. **Équitable** : aucun de nous deux n'est avantagé par ses habitudes ou son poids de départ.

Nom provisoire : « Duel des Défauts ».

## Les joueurs

Deux joueurs, Laetitia et Arthus, chacun sur son téléphone avec son propre compte.

- Chacun voit en direct le score et les check-ins de l'autre : c'est tout le principe du duel.
- Exception, le poids : chacun ne voit que l'évolution de l'autre en %, pas ses kilos. Une option dans les réglages permet de les montrer.
- Prénoms, avatars et couleurs sont modifiables.

## Ce qu'on suit

Cinq habitudes au départ, toutes modifiables dans l'app.

| Habitude | Qui | Type | Fréquence |
| --- | --- | --- | --- |
| 💅 Ongles (ne pas se les ronger) | Arthus | À éviter | Chaque jour |
| 🦟 Grattage (ne pas se gratter) | Laetitia | À éviter | Chaque jour |
| 🍪 Grignotage (en dehors des repas) | Les deux | À éviter | Chaque jour |
| 🏃 Sport (30 min d'activité minimum) | Les deux | À faire | Chaque jour |
| ⚖️ Poids | Les deux | Pesée | Une fois par semaine |

Chacun peut ajouter, renommer ou désactiver une habitude et choisir son emoji (idées : 💧 eau, 🍷 alcool, 😴 sommeil). Une modification ne s'applique qu'à partir du lundi suivant : pas de changement de règles en cours de manche.

## Règles du jeu

Chacun est noté sur 100 par jour et le poids compte en %, pour que le duel reste équitable. Toute cette logique est dans **un seul fichier de config facile à modifier**.

### La manche

Une semaine, du lundi 00:00 au dimanche 23:59, heure de Paris (`Europe/Paris`).

### Le check-in quotidien

Pour chaque habitude :

- **À éviter** : 😇 Nickel = 10 pts · 😬 Un peu = 5 pts · 🙈 Craquage = 0 pt.
- **À faire** : 💪 Fait = 10 pts · 🛋️ Pas fait = 0 pt.
- **Score du jour** = points obtenus ÷ points possibles × 100. Chacun a donc un score sur 100, même avec un nombre d'habitudes différent.
- On peut remplir ou corriger **aujourd'hui et hier** (en cas d'oubli), rien avant. Une habitude non remplie vaut 0 pt, donc un jour oublié vaut 0.

### La pesée

Une par semaine, jour réglable, par défaut le dimanche matin.

- On compare **en %** à la pesée précédente, pour ne pas avantager celui qui a le plus à perdre.
- **−1 % ou plus = 100 pts.** C'est un plafond voulu : on ne récompense pas les régimes extrêmes.
- Entre 0 et −1 % : proportionnel (−0,5 % = 50 pts). Stable, en hausse ou pas de pesée = 0 pt.
- Une fois son poids objectif atteint, rester à ±1 % de l'objectif rapporte 100 pts.
- La toute première pesée sert de point de départ et ne rapporte rien.

### La fin de manche

- **Score de la semaine** = somme des 7 jours (max 700) + pesée (max 100), soit 800 max.
- Le plus haut score gagne la manche 🏆. En cas d'égalité, gage pour les deux.
- Le perdant fait le gage de la semaine ; le gagnant valide « Gage payé ✅ ».
- L'app garde le bilan global des manches, par exemple « Laetitia 4 – 2 Arthus ».

## Écrans

Navigation par une barre d'onglets en bas : **Ring, Check-in, Stats, Badges, Réglages**. La pesée et les résultats s'ouvrent depuis le Ring.

### 1. Le Ring (accueil)

- Les deux avatars face à face, avec leur score de la semaine.
- Un tir à la corde animé : le nœud se déplace vers celui qui mène, proportionnellement à l'écart.
- Une phrase taquine qui change selon la situation.
- Le statut du jour de chacun : ✅ check-in fait ou 👀 pas encore.
- Les jours restants, l'enjeu de la semaine et le bilan global des manches.
- Un gros bouton « Mon check-in », et un rappel « C'est le jour de la pesée ⚖️ » le jour J.
- Mise à jour en direct quand l'autre fait son check-in, avec un petit toast (« 👀 Laetitia vient de faire son check-in »).

### 2. Check-in du jour

- Une carte par habitude, avec de gros boutons emoji : 3 états pour « à éviter », 2 pour « à faire ».
- Rebond au tap, score du jour qui monte en direct, confettis si la journée est parfaite.
- Une bascule « Aujourd'hui / Hier » pour rattraper un oubli.

### 3. Pesée

- Saisie au 0,1 kg avec un gros sélecteur +/−, préremplie avec la dernière pesée.
- Affiche la variation en %, une réaction emoji et les points gagnés.

### 4. Résultats de la semaine

S'ouvre tout seul à la première visite du lundi.

- Une petite cérémonie : couronne 👑 et confettis pour le gagnant, 😭 pour le perdant.
- Le détail des points jour par jour.
- Le gage à faire, avec le bouton « Gage payé ✅ ».

### 5. Stats

- La course au poids : les courbes des deux joueurs en % depuis le départ, sur le même graphique.
- Un calendrier par habitude (vert = nickel, orange = un peu, rouge = craquage), avec les séries en cours 🔥 et les records.
- L'historique des manches.

### 6. Badges

Une galerie : badges grisés tant qu'ils ne sont pas débloqués, animation au déblocage. Pour commencer :

| Badge | Condition |
| --- | --- |
| 💅 Manucure intacte | 7 jours sans se ronger les ongles |
| 🧘 Zen absolu | 7 jours sans se gratter |
| 🔒 Frigo fermé | 7 jours sans grignoter |
| 🏋️ Machine | Sport 5 jours dans la même semaine |
| 📅 Assidu·e | Check-in 7 jours sur 7 |
| 🪶 Plume | −2 % depuis le départ, puis −5 % et −10 % |
| 🚀 Remontada | Gagner une manche en étant mené le jeudi soir |
| 👑 Série royale | 3 manches gagnées d'affilée |
| 🔥 Inarrêtable | 30 jours d'affilée « nickel » sur une même habitude à éviter |

### 7. Réglages

- Prénom, emoji avatar, couleur, poids objectif, option « montrer mes kilos à l'autre ».
- Habitudes : ajouter, renommer, désactiver, choisir l'emoji et le type.
- Jour de la pesée.
- Enjeu de la semaine : texte libre, liste de gages (vaisselle pendant une semaine, massage de 15 min, choix du film, petit-déj au lit…) et une roulette 🎲 qui en tire un au hasard.

## Style et ton

L'app doit ressembler à un **jeu mobile**, pas à une appli de santé.

- Gros boutons arrondis, ombres douces, emojis XXL en guise d'illustrations, animations rebondissantes.
- Chaque joueur a sa couleur, utilisée partout (avatar, barres, courbes) : par défaut **corail pour Laetitia**, **bleu électrique pour Arthus**.
- Une police ronde et sympa, par exemple Fredoka ou Nunito.
- Mobile d'abord (iPhone) : grandes zones tactiles, encoche et barre du bas respectées (safe areas).
- Interface 100 % en français.

Ton taquin et complice, plein d'emojis, en français familier. On se chambre, mais **jamais méchamment, et jamais sur le physique ou le poids**. Quelques exemples :

- « Laetitia mène de 40 pts. Arthus, lâche ce paquet de chips 🍟 »
- « Journée parfaite ! Tes ongles te disent merci 💅 »
- « Le frigo a gagné aujourd'hui 🍫… revanche demain. »
- « Arthus n'a pas encore fait son check-in 👀 »

Une trentaine de phrases, choisies selon la situation : qui mène, l'écart, les séries en cours, le jour de la semaine.

## Stack technique

Une app web installable (**PWA**) : on l'ajoute à l'écran d'accueil, sur iPhone comme sur Android, sans passer par l'App Store.

- **Front** : Vite, React, TypeScript, Tailwind CSS, vite-plugin-pwa.
- **Données, connexion et temps réel** : Supabase (offre gratuite).
- **Connexion** par prénom + code secret (décision 20) : pas d'email ni de compte à créer. La première fois sur un téléphone, on touche son prénom et on tape son code ; le téléphone s'en souvient ensuite.
- **Sécurité** : seuls les téléphones qui ont donné le bon code accèdent aux données, et chacun ne modifie que ses propres check-ins et pesées. Les tables ne sont pas accessibles directement (Row Level Security sans aucune règle d'accès) : l'app passe uniquement par des fonctions du serveur qui vérifient qui joue, appliquent les règles et masquent les kilos de l'autre.
- **Hébergement** : Vercel (gratuit), déployé depuis un repo GitHub.
- **Librairies** : Motion (ex-Framer Motion) pour les animations, canvas-confetti, Recharts pour les graphiques, date-fns avec le fuseau Europe/Paris.
- **Modèle de données indicatif** : `players`, `habits`, `checkins` (un seul par joueur, habitude et jour), `weigh_ins`, `weeks` (enjeu, gage payé). Les badges peuvent être calculés.
- **Logique de score** dans un module pur, sans dépendance à l'interface ni à la base, couvert par des tests Vitest : score sur 100, pesée plafonnée, égalité, jour non rempli, passage d'une semaine à l'autre.
- **Aucune clé dans le code** : un `.env` (non versionné) et un `.env.example`.

## Méthode de travail

Avancer par étapes et montrer le résultat à chaque fois. À la fin de chaque étape : vérifier que tout compile et que les tests passent, puis dire quoi tester.

1. Enregistrer ce cahier des charges dans `SPEC.md` et le tenir à jour.
2. Questions (5 maximum) puis plan court.
3. **Maquette** : l'app complète et navigable avec des données de démo (3 semaines fictives), sans backend, pour valider le look. Expliquer comment l'ouvrir sur le téléphone, puis **attendre le feu vert**.
4. **Backend** : Supabase (schéma, sécurité, création des deux joueurs et des habitudes de départ) et connexion.
5. **Tout brancher** : check-in, pesée, Ring en temps réel, résultats, stats, badges, réglages.
6. **Mise en ligne** : PWA (manifest, icônes, écran de démarrage), déploiement sur Vercel, README (installation, déploiement, ajout à l'écran d'accueil sur iPhone et Android, où modifier les règles).

Pour tout ce qu'Arthus doit faire lui-même (créer les comptes Supabase, Vercel et GitHub, copier les clés) : guide pas à pas.

## C'est fini quand…

- On peut tous les deux se connecter depuis nos téléphones, faire notre check-in et nous peser.
- Le Ring bouge en direct quand l'autre joue.
- Les résultats de la semaine s'affichent le lundi.
- Les tests de la logique de score passent.

## Plus tard (pas dans la V1)

Ne pas coder maintenant, mais garder une architecture qui permet de les ajouter facilement.

- **Notifications** : rappel du check-in à 21 h, jour de la pesée, « Laetitia vient de passer devant 😈 ». Sur iPhone, elles ne marchent que si l'app est installée sur l'écran d'accueil.
- Un bouton **« Chambrer 😈 »** qui envoie une pique au hasard à l'autre.
- Des **jokers** : un par semaine pour neutraliser une journée (anniversaire, resto…).
- Des **saisons** de 12 semaines avec un grand enjeu final, par exemple le perdant offre le week-end.
- Des **défis bonus** de la semaine, par exemple zéro grignotage après 20 h.

## Décisions et précisions

_Points tranchés pendant le projet. Ils complètent (et priment sur) les sections ci-dessus._

### Validées par Arthus (16/11/2026)

1. **Fin de manche stricte** : la manche est close le dimanche à 23:59. Le lundi, « Hier » (le dimanche) n'est plus modifiable. Les résultats sont définitifs dès le lundi 00:00. En milieu de semaine, la règle « aujourd'hui et hier » s'applique normalement.
2. **Les changements de règles se valident à deux** : ajouter une habitude, la désactiver ou changer son type est une *proposition* que l'autre accepte ou refuse d'un tap. Acceptée, elle s'applique le lundi suivant. Renommer une habitude ou changer son emoji reste libre et immédiat (c'est cosmétique).
3. **Pesée le jour J uniquement** : on ne peut se peser que le jour de la pesée, et corriger jusqu'à 23:59 ce jour-là. Pas de pesée = 0 pt ; la suivante se compare à la dernière pesée existante. La pesée de départ suit la même règle.
4. **Enjeu de la semaine** : chaque lundi, la roulette 🎲 tire automatiquement un gage dans la liste. Chacun peut le remplacer (texte libre ou nouveau tirage) jusqu'au lundi 23:59 ; ensuite il est verrouillé jusqu'à la fin de la manche.
20. **Pas de comptes : prénom + code** : la première fois sur un téléphone, on touche son prénom et on tape un code à 6 chiffres (le tout premier code tapé pour un prénom devient le sien). Le téléphone reste connecté ensuite. Le code se change dans les Réglages ; « Se déconnecter » oublie ce téléphone. Après 10 codes faux en 15 minutes sur un prénom, il faut attendre (contre les petits malins).

### Précisions ajoutées par Claude (à contester si besoin)

5. **Poids objectif et jour de la pesée = changements de règles** : ils passent aussi par une proposition acceptée par l'autre, effective le lundi suivant. Sinon, se fixer un objectif égal à son poids actuel rapporterait 100 pts chaque semaine. Le jour de la pesée est commun aux deux joueurs.
6. **Réglages libres et immédiats** : prénom, emoji avatar, couleur, option « montrer mes kilos », liste des gages.
7. **Arrondis** : le score du jour est arrondi à l'entier le plus proche, et c'est cette valeur qui compte (ce qu'on voit = ce qui compte). Les points de pesée aussi. Égalité = même total entier.
8. **Zone objectif** : être à ±1 % de son poids objectif rapporte 100 pts dès qu'on y est. La pesée rapporte le meilleur des deux calculs (variation ou zone objectif).
9. **Habitudes « Les deux »** : chaque joueur a sa propre copie (renommer la sienne ne change pas celle de l'autre).
10. **Check-in fait** (✅ sur le Ring) = toutes les habitudes du jour sont remplies.
11. **Égalité** : les deux font le gage, et chacun valide le « Gage payé ✅ » de l'autre.
12. **Cérémonie des résultats** : elle s'ouvre toute seule à la première visite après la fin de la manche (le lundi, ou plus tard si on n'ouvre pas l'app), une fois par joueur.
13. **Badges** : « 7 jours sans… » = 7 jours d'affilée à 😇 Nickel (un jour non rempli casse la série) ; 📅 Assidu·e = 7 jours d'affilée avec un check-in complet ; 🚀 Remontada = être strictement mené au total du lundi au jeudi, puis gagner la manche ; 👑 Série royale = 3 manches gagnées d'affilée (une égalité casse la série). Un badge débloqué le reste.
14. **Début du duel** : la date de début (un lundi) est dans le fichier de config. Conseil : faire la pesée de départ le dimanche d'avant.
15. **Jours restants** : le jour en cours compte (le dimanche, il reste 1 jour).
16. **Badges gravés** : un badge (ou un palier 🪶) est enregistré dès qu'il est débloqué. Si une correction encore permise (aujourd'hui, hier, pesée du jour) repasse ensuite sous le seuil, il reste débloqué. Les célébrations déjà vues sont enregistrées par joueur (elles ne se rejouent pas sur un autre téléphone).
17. **Une proposition à la fois par sujet** : refaire une proposition sur le même sujet (objectif, jour de pesée, type ou désactivation d'une même habitude) remplace celle en attente.
18. **Objectif de poids privé** : l'autre ne voit jamais le poids objectif en kg, seulement le % depuis le départ, y compris dans les propositions (sauf si on a choisi de montrer ses kilos).
19. **Tirage automatique** : le gage du lundi est tiré au sort de façon déterministe (même liste + même lundi = même gage), pour que les deux téléphones tirent le même sans se concerter. Jamais deux fois le même gage d'affilée quand la liste en propose d'autres.

## Journal des modifications

| Date | Changement |
| --- | --- |
| 2026-11-16 | Création du cahier des charges. |
| 2026-11-16 | Décisions 1 à 4 validées (fin de manche, changements de règles à deux, pesée le jour J, enjeu verrouillé le lundi soir) ; précisions 5 à 15. |
| 2026-11-16 | Maquette relue (règles, rendu iPhone, textes, parcours, confidentialité) ; précisions 16 à 19. |
| 2026-11-16 | Décision 20 : connexion par prénom + code au lieu de comptes email. Sécurité : accès aux données uniquement par des fonctions du serveur. |
