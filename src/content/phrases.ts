/**
 * 😈 Toutes les phrases de l'app, faciles à modifier.
 *
 * Ton : taquin et complice, plein d'emojis, en français familier.
 * On se chambre, mais JAMAIS méchamment, et JAMAIS sur le physique ou le poids
 * (les phrases du Ring ne parlent jamais de kilos : un test le vérifie).
 *
 * Écriture (vérifiée par les tests de src/core/taunts.test.ts) :
 * - les phrases valent pour Laetitia comme pour Arthus : formes neutres ou écriture
 *   inclusive (mené·e, champion·ne) ;
 * - {habit} peut être une habitude perso (« Eau », « Légumes », « Écrans au lit ») :
 *   rien ne s'accorde avec elle (« {emoji} {habit} : pas fait aujourd’hui ») ;
 * - écrire « de {other} » ou « que {other} » : l'élision (« d’Arthus ») est automatique ;
 * - espaces normales avant ! ? : ; et dans « » : les espaces insécables sont
 *   ajoutées automatiquement (typo() de src/core/fr.ts) ; apostrophe courbe ’ ;
 * - pas de mot anglais.
 *
 * Le choix de la phrase est fait dans src/core/taunts.ts :
 * - on garde les phrases dont toutes les conditions sont vraies ;
 * - une phrase est tirée au sort de façon stable avec la date (pas de
 *   clignotement d'un rendu à l'autre, mais ça change d'un jour à l'autre) ;
 * - les plus précises sont favorisées : chaque condition double les chances
 *   (une phrase à 2 conditions sort 4 fois plus souvent qu'une phrase sans condition).
 * Une phrase dont un {trou} ne peut pas être rempli est ignorée.
 *
 * Ajouter une phrase = ajouter une ligne dans la bonne liste. C'est tout.
 */
import type { BadgeHabitKey } from '../core/types'

// ─── Ring ───────────────────────────────────────────────────────────────────

/** Qui mène la manche en cours, du point de vue du joueur connecté. */
export type Lead = 'me' | 'other' | 'tie'
/** Écart de points : égalité, petit (< 30), moyen (30 à 100), gros (> 100). */
export type GapBucket = 'tie' | 'small' | 'medium' | 'large'
/**
 * Moment de la manche : lundi (nouveau départ), mardi-mercredi (milieu),
 * jeudi (tension), vendredi-samedi (sprint final), dimanche (dernier jour).
 */
export type DayBucket = 'monday' | 'midweek' | 'thursday' | 'sprint' | 'sunday'

/**
 * Situations du Ring.
 * Urgentes (toujours prioritaires, dans cet ordre) :
 * - notStarted : le duel n'a pas encore commencé ;
 * - evening : c'est le soir et mon check-in n'est pas fait ;
 * - weighin : c'est le jour de la pesée et je ne me suis pas encore pesé·e ;
 * - otherPending : j'ai fait mon check-in, l'autre pas encore 👀.
 * Les autres sont tirées au sort (de façon stable) parmi celles qui s'appliquent :
 * - day : selon le jour de la semaine ; score : qui mène et de combien ;
 * - revenge : j'ai perdu la manche précédente (lundi → mercredi) ;
 * - defend : j'ai gagné la manche précédente (lundi → mercredi) ;
 * - myStreak / otherStreak : une série 🔥 d'au moins 3 jours ;
 * - record : le bilan global (au moins 2 manches jouées).
 */
export type RingSituation =
  | 'notStarted'
  | 'evening'
  | 'weighin'
  | 'otherPending'
  | 'day'
  | 'score'
  | 'revenge'
  | 'defend'
  | 'myStreak'
  | 'otherStreak'
  | 'record'

/**
 * Une phrase du Ring et ses conditions (toutes facultatives).
 *
 * Trous disponibles :
 * - {me}, {other} : prénoms (moi = le joueur connecté) ;
 * - {leader}, {trailer} : celui qui mène / celui qui est mené (pas en cas d'égalité) ;
 * - {gap} : l'écart avec l'unité, ex. « 40 pts » ;
 * - {myTotal}, {otherTotal} : les scores de la semaine ;
 * - {daysLeft} : jours restants avec l'unité, ex. « 3 jours » ;
 * - {hour} : l'heure avec l'unité, ex. « 21 h » ;
 * - {maxPoints} : le maximum de points de la pesée avec l'unité, ex. « 100 pts » ;
 * - {habit}, {emoji}, {days} : la série 🔥 (myStreak / otherStreak uniquement),
 *   {days} avec l'unité, ex. « 12 jours » ;
 * - {myWins}, {otherWins} : le bilan global des manches ;
 * - {winStreak} : nombre de manches gagnées d'affilée (defend uniquement).
 */
export interface RingPhrase {
  text: string
  lead?: Lead | Lead[]
  gap?: GapBucket | GapBucket[]
  day?: DayBucket | DayBucket[]
  /** À partir de cette heure (incluse). */
  minHour?: number
  /** Qui mène au bilan global. */
  recordLead?: Lead | Lead[]
  /** Au moins ce nombre de manches gagnées d'affilée (defend). */
  minWinStreak?: number
}

const ANY_LEAD: Lead[] = ['me', 'other']

export const RING_PHRASES: Record<RingSituation, RingPhrase[]> = {
  notStarted: [
    { text: 'Le duel commence lundi. Échauffez-vous, ça va chauffer 🥊' },
    { text: '{me} contre {other} : premier coup de gong lundi 🔔 Préparez vos emojis !' },
  ],

  evening: [
    { text: 'Il est {hour} et ton check-in t’attend toujours ⏰' },
    { text: 'Psst, {me}… ton check-in, c’est 15 secondes chrono ⏱️' },
    { text: '{other} te regarde 👀 Ton check-in du jour n’est pas fait…' },
    { text: '{other} mène de {gap} et ton check-in n’est même pas fait 🙃 Allez hop !', lead: 'other' },
    { text: 'Tu mènes de {gap}… à condition de faire ton check-in ce soir 😉', lead: 'me' },
    { text: 'Égalité parfaite. Ton check-in de ce soir peut tout faire basculer 🎯', lead: 'tie' },
    { text: 'Dernier soir de la manche 🚨 Ton check-in, c’est maintenant ou jamais !', day: 'sunday' },
  ],

  weighin: [
    { text: 'C’est le jour de la pesée ⚖️ Jusqu’à {maxPoints} à aller chercher !' },
    { text: 'Jour de pesée ⚖️ Un petit passage sur la balance et c’est plié 🎯' },
    { text: 'Pesée du jour ⚖️ : {gap} de retard, et tout peut se jouer maintenant 👀', lead: 'other', gap: ['small', 'medium'] },
    { text: 'Jour de pesée ⚖️ L’occasion rêvée de reprendre {gap} à {other} 😤', lead: 'other', gap: ['small', 'medium'] },
    { text: 'Jour de pesée ⚖️ De quoi creuser encore l’écart, {me} 😏', lead: 'me' },
    { text: 'Égalité et jour de pesée ⚖️ Qui va faire la différence ? 🍿', lead: 'tie' },
  ],

  otherPending: [
    { text: '{other} n’a pas encore fait son check-in 👀' },
    { text: 'Toi, c’est fait ✅ {other} ? Toujours rien 👀' },
    { text: 'Check-in fait ✅ Maintenant on attend {other}… 🍿' },
    { text: 'Il est {hour} et {other} n’a toujours pas fait son check-in… suspect 🕵️', minHour: 19 },
    { text: '{other} n’a pas encore fait son check-in 👀 Il se passe quoi là-bas ?', minHour: 19 },
  ],

  day: [
    // Lundi : nouveau départ
    { text: 'Nouvelle manche, égalité parfaite. Que le duel commence 🥊', day: 'monday', lead: 'tie' },
    { text: 'Lundi, nouveau départ 🏁 Qui prend l’avance gagne le droit de frimer 😎', day: 'monday', lead: 'tie' },
    { text: 'Lundi, et tu mènes déjà de {gap}. Ça commence fort 😎', day: 'monday', lead: 'me' },
    { text: 'Démarrage canon 🚀 {me} prend {gap} d’avance dès lundi', day: 'monday', lead: 'me' },
    { text: '{other} démarre en trombe (+{gap}). Réveille-toi, {me} ☕', day: 'monday', lead: 'other' },
    { text: 'Lundi, et déjà {gap} de retard… le café d’abord, la revanche ensuite ☕', day: 'monday', lead: 'other' },
    // Milieu de semaine
    { text: 'Mi-manche : {gap} d’avance. Garde le rythme 🏃', day: 'midweek', lead: 'me' },
    { text: 'Mi-manche, {leader} devant de {gap}. Rien n’est joué 🎲', day: 'midweek', lead: ANY_LEAD, gap: ['small', 'medium'] },
    { text: 'Mi-manche et déjà {gap} d’avance pour {leader}. Ça sent le carton 😏', day: 'midweek', lead: ANY_LEAD, gap: 'large' },
    { text: '{other} mène de {gap} à mi-manche. Le moment idéal pour accélérer 🏎️', day: 'midweek', lead: 'other' },
    { text: 'Mi-manche et toujours à égalité 🤝 Vous êtes des clones ou quoi ?', day: 'midweek', lead: 'tie' },
    { text: 'Toujours à égalité au milieu de la semaine. Ça sent la finale 🍿', day: 'midweek', lead: 'tie' },
    // Jeudi : tension
    { text: 'Jeudi, l’heure de vérité approche 😬 {leader} mène de {gap}', day: 'thursday', lead: ANY_LEAD },
    { text: 'Jeudi, pile le moment rêvé pour une remontada 🚀', day: 'thursday', lead: 'other' },
    { text: 'Jeudi : {gap} d’avance. Attention à la remontada de {other} 🚀', day: 'thursday', lead: 'me' },
    { text: 'Jeudi et égalité parfaite. Tension maximale 🫣', day: 'thursday', lead: 'tie' },
    { text: 'Jeudi, personne ne lâche rien 😤 Égalité !', day: 'thursday', lead: 'tie' },
    // Vendredi-samedi : sprint final
    { text: 'Sprint final 🏁 {trailer} doit rattraper {gap} en {daysLeft}', day: 'sprint', lead: ANY_LEAD },
    { text: 'Dernière ligne droite et tu mènes de {gap}. Pas de relâchement 😤', day: 'sprint', lead: 'me' },
    { text: 'Plus que {daysLeft} pour reprendre {gap} à {other}. Faisable 💪', day: 'sprint', lead: 'other' },
    { text: 'Sprint final et égalité 🏁 Qui craque en premier a perdu', day: 'sprint', lead: 'tie' },
    { text: 'Égalité à {daysLeft} de la fin 😳 Qui va flancher ?', day: 'sprint', lead: 'tie' },
    // Dimanche : dernier jour
    { text: 'Dernier jour ! {trailer} a encore {gap} à rattraper 😬', day: 'sunday', lead: ANY_LEAD, gap: ['small', 'medium'] },
    { text: 'Dimanche, dernier jour de combat 🔔 Tout se joue aujourd’hui', day: 'sunday', lead: ANY_LEAD, gap: ['small', 'medium'] },
    { text: 'Dimanche et {gap} d’avance… {leader} sent déjà la victoire 👑', day: 'sunday', lead: ANY_LEAD, gap: 'large' },
    { text: 'Dernier jour, {gap} d’écart. {trailer} prépare déjà le gage ? 😈', day: 'sunday', lead: ANY_LEAD, gap: 'large' },
    { text: 'Dimanche et égalité parfaite 😱 Chaque point compte !', day: 'sunday', lead: 'tie' },
    { text: 'Dernier jour, zéro écart 🤯 Le check-in de ce soir décidera de tout', day: 'sunday', lead: 'tie' },
  ],

  score: [
    { text: 'Égalité parfaite. Ça sent la bagarre 🥊', lead: 'tie' },
    { text: '{me} {myTotal} – {otherTotal} {other}. Impossible de vous départager 🤝', lead: 'tie' },
    { text: 'Ex æquo ! Le prochain check-in fera la différence 🎯', lead: 'tie' },
    { text: 'Tu mènes de {gap}. C’est serré, ne lâche rien 😤', lead: 'me', gap: 'small' },
    { text: '{gap} d’avance… à un biscuit près 🍪 Reste concentré·e', lead: 'me', gap: 'small' },
    { text: '{other} mène de {gap}. Un check-in parfait et c’est réglé 😏', lead: 'other', gap: 'small' },
    { text: 'Seulement {gap} de retard. Ça se joue à un biscuit près 🍪', lead: 'other', gap: 'small' },
    { text: '{leader} mène de {gap}. {trailer}, lâche ce paquet de chips 🍟', lead: ANY_LEAD, gap: 'medium' },
    { text: '{gap} d’avance. {other} va devoir sortir le grand jeu 🎩', lead: 'me', gap: 'medium' },
    { text: '{other} te met {gap} dans la vue. On se réveille ? ⏰', lead: 'other', gap: 'medium' },
    { text: '{gap} d’avance 😎 {other} est en PLS', lead: 'me', gap: 'large' },
    { text: '{leader} file vers la victoire avec {gap} d’avance 🏎️', lead: ANY_LEAD, gap: 'large' },
    { text: '{other} mène de {gap}… Remontada en vue ? 🚀', lead: 'other', gap: 'large' },
  ],

  revenge: [
    { text: '{other} a gagné la dernière manche. L’heure de la revanche a sonné ⚔️' },
    { text: 'Revanche en cours : tu mènes de {gap} 😤🔥', lead: 'me' },
    { text: 'Perdre deux manches de suite ? Hors de question. Au boulot, {me} 💪', lead: ['other', 'tie'] },
  ],

  defend: [
    { text: 'Tenant·e du titre 👑 Mais {other} veut sa revanche…' },
    { text: '{winStreak} manches gagnées d’affilée 👑 {other} n’en peut plus', minWinStreak: 2 },
  ],

  myStreak: [
    { text: '🔥 {days} d’affilée sur {emoji} {habit} ! On lâche rien' },
    { text: 'Série en cours : {days} {emoji} {habit} 🔥 {other} peut aller se rhabiller' },
    { text: '{emoji} {habit} : {days} de suite. T’es en feu, {me} 🔥' },
  ],

  otherStreak: [
    { text: '{other} enchaîne {days} sur {emoji} {habit} 🔥 Faut suivre le rythme !' },
    { text: 'Attention, {other} est en série : {days} {emoji} {habit} 😳' },
  ],

  record: [
    { text: 'Bilan global : {me} {myWins} – {otherWins} {other} 🏆 Tu tiens la baraque', recordLead: 'me' },
    { text: 'Au bilan, {other} mène {otherWins} – {myWins}. Il est temps de rééquilibrer ça 😤', recordLead: 'other' },
    { text: '{myWins} – {otherWins} au bilan. Cette manche va compter double 👀', recordLead: 'tie' },
  ],
}

// ─── Check-in ───────────────────────────────────────────────────────────────

/**
 * État de la journée pour la phrase du check-in :
 * - empty : rien de rempli ; partial : en cours ;
 * - perfect : 100/100 ;
 * - craquage : au moins un 🙈 Craquage (même en cours de remplissage) ;
 * - pasfait : journée complète avec au moins un 🛋️ Pas fait ;
 * - unpeu : journée complète, pas parfaite, sans craquage ni « pas fait ».
 */
export type CheckinState = 'empty' | 'partial' | 'perfect' | 'craquage' | 'pasfait' | 'unpeu'

/**
 * Trous : {name} (prénom), {score} (score du jour), {max} (score maximum d'un jour,
 * ex. 100), {left} (habitudes restantes avec l'unité, ex. « 2 habitudes »), {habit}
 * et {emoji} (l'habitude concernée, qui peut être une habitude perso : ne rien accorder
 * avec elle).
 */
export interface CheckinPhrase {
  text: string
  state: CheckinState
  /** La phrase ne sort que si cette habitude est concernée (réussie / ratée selon l'état). */
  habit?: BadgeHabitKey
  /**
   * 'today' : seulement pour le check-in du jour (peut dire « aujourd’hui », « demain ») ;
   * 'yesterday' : seulement en rattrapage d'hier (au passé, sans « aujourd’hui » ni
   * « demain ») ; absent : valable dans les deux cas.
   */
  when?: 'today' | 'yesterday'
}

export const CHECKIN_PHRASES: CheckinPhrase[] = [
  // Pas commencé
  { state: 'empty', text: 'Allez, {name}, 15 secondes chrono ⏱️' },
  { state: 'empty', text: 'Une touche par habitude et c’est plié 👆' },
  { state: 'empty', text: 'Ton check-in t’attend. Sois honnête, on te regarde 👀' },
  { state: 'empty', when: 'yesterday', text: 'Un petit oubli hier ? Ça se rattrape en 15 secondes ⏱️' },
  // En cours
  { state: 'partial', text: 'Encore {left} à remplir et c’est bouclé 👉' },
  { state: 'partial', text: 'C’est parti ! Plus que {left} 💨' },
  { state: 'partial', text: 'Ça avance… {score}/{max} pour l’instant 📈' },
  // Journée parfaite
  { state: 'perfect', text: 'Journée parfaite ! Tes ongles te disent merci 💅', habit: 'ongles' },
  { state: 'perfect', text: 'Journée parfaite ! Zéro grattage, zen absolu 🧘', habit: 'grattage' },
  { state: 'perfect', text: 'Journée parfaite ! Le frigo est resté fermé à double tour 🔒', habit: 'grignotage' },
  { state: 'perfect', text: 'Journée parfaite ! Sport fait, t’es une machine 🏋️', habit: 'sport' },
  { state: 'perfect', text: '{max}/{max} ! Rien à redire, {name} en mode champion·ne 🏆' },
  { state: 'perfect', text: 'Sans faute 🎉 Journée parfaite !' },
  { state: 'perfect', when: 'yesterday', text: 'Rattrapage parfait 🎉 Hier, c’était un sans-faute !' },
  // Craquage
  { state: 'craquage', when: 'today', text: 'Le frigo a gagné aujourd’hui 🍫… revanche demain.', habit: 'grignotage' },
  { state: 'craquage', when: 'today', text: 'Petite razzia sur les placards 🍪… demain on se reprend.', habit: 'grignotage' },
  { state: 'craquage', when: 'today', text: 'Les ongles ont trinqué aujourd’hui 💅… demain on tient bon.', habit: 'ongles' },
  { state: 'craquage', when: 'today', text: 'Ça a gratouillé aujourd’hui 🦟… demain, zen absolu 🧘', habit: 'grattage' },
  { state: 'craquage', when: 'today', text: '{emoji} {habit} : la tentation l’a emporté aujourd’hui… revanche demain 💪' },
  { state: 'craquage', when: 'today', text: 'Un craquage, ça arrive à tout le monde 🙈 Demain on repart à zéro.' },
  { state: 'craquage', when: 'yesterday', text: 'Hier, le frigo a gagné une bataille 🍫… pas la guerre 😤', habit: 'grignotage' },
  { state: 'craquage', when: 'yesterday', text: 'Hier, les ongles ont trinqué 💅… on tourne la page.', habit: 'ongles' },
  { state: 'craquage', when: 'yesterday', text: 'Hier, ça a gratouillé 🦟… on respire et on repart 🧘', habit: 'grattage' },
  { state: 'craquage', when: 'yesterday', text: '{emoji} {habit} : la tentation l’a emporté hier… on tourne la page 💪' },
  { state: 'craquage', when: 'yesterday', text: 'Un craquage hier ? Ça arrive à tout le monde 🙈 Merci pour l’honnêteté.' },
  // Pas fait
  { state: 'pasfait', when: 'today', text: 'Le canapé a gagné aujourd’hui 🛋️… demain on bouge !', habit: 'sport' },
  { state: 'pasfait', when: 'today', text: 'Pas de sport aujourd’hui ? Demain, les baskets t’attendent 👟', habit: 'sport' },
  { state: 'pasfait', when: 'today', text: '{emoji} {habit} : pas fait aujourd’hui… demain c’est la bonne 💪' },
  { state: 'pasfait', when: 'yesterday', text: 'Hier, le canapé a gagné 🛋️… les baskets attendent leur revanche 👟', habit: 'sport' },
  { state: 'pasfait', when: 'yesterday', text: '{emoji} {habit} : pas fait hier… la suite de la manche est à toi 💪' },
  // Presque
  { state: 'unpeu', text: '{score}/{max}, pas mal du tout ! Le {max} est à portée de main 💪' },
  { state: 'unpeu', text: 'Presque parfait 😬 Un petit « un peu » qui traîne…' },
  { state: 'unpeu', when: 'today', text: 'Check-in bouclé ✅ {score}/{max}, on vise le carton plein demain 🎯' },
  { state: 'unpeu', when: 'yesterday', text: 'Hier bouclé ✅ {score}/{max}, joli rattrapage 😉' },
]

// ─── Pesée ──────────────────────────────────────────────────────────────────

/**
 * Réactions à la pesée, par tranche de points. On parle de points et d'effort,
 * jamais du corps. Trou : {points} (points gagnés avec l'unité, ex. « 50 pts »).
 * - start : toute première pesée (point de départ) ;
 * - goal : 100 pts grâce à la zone objectif (seulement si on y est vraiment, voir weighInBucket) ;
 * - max : 100 pts ; great : 60 à 99 ; good : 30 à 59 ; small : 1 à 29 ; zero : 0.
 */
export type WeighInBucket = 'start' | 'goal' | 'max' | 'great' | 'good' | 'small' | 'zero'

export const WEIGHIN_REACTIONS: Record<WeighInBucket, { emoji: string; text: string }[]> = {
  start: [
    { emoji: '📍', text: 'Point de départ enregistré ! Les points, c’est pour la prochaine fois 😉' },
    { emoji: '🏁', text: 'Et c’est parti ! Cette pesée sert de ligne de départ.' },
  ],
  goal: [
    { emoji: '🎯', text: 'Zone objectif tenue : {points} dans la poche !' },
    { emoji: '🏆', text: 'Objectif tenu, {points}. Propre !' },
  ],
  max: [
    { emoji: '🚀', text: '{points}, plein pot ! L’effort paie.' },
    { emoji: '💯', text: 'Le maximum de points. Respect 🙌' },
  ],
  great: [
    { emoji: '🔥', text: '{points} ! Belle semaine d’efforts.' },
    { emoji: '💪', text: '{points} dans la besace. Ça paie !' },
  ],
  good: [
    { emoji: '👍', text: '{points}, c’est toujours ça de pris !' },
    { emoji: '😊', text: '{points}. Petit à petit, l’oiseau fait son nid 🐦' },
  ],
  small: [
    { emoji: '🙂', text: '{points}, chaque point compte !' },
    { emoji: '👣', text: '{points}. Petit pas, mais bon pas !' },
  ],
  zero: [
    { emoji: '🤷', text: 'Pas de points cette fois. On se rattrape aux check-ins 💪' },
    { emoji: '😌', text: '{points} cette semaine, pas de panique : la manche se joue aussi au quotidien.' },
  ],
}

// ─── Résultats de la manche ─────────────────────────────────────────────────

/** Écart final : petit (< 30), moyen (30 à 100), gros (> 100). */
export type ResultGap = 'small' | 'medium' | 'large'

/**
 * Trous : {winner}, {loser} (prénoms), {gap} (écart avec l'unité), {stake} (le gage,
 * première lettre en minuscule pour s'insérer dans la phrase : « au programme : vaisselle… »).
 * En cas d'égalité, {winner} et {loser} sont simplement les deux joueurs.
 * La cérémonie s'ouvre APRÈS la manche (le lundi ou plus tard) : pas de « dès lundi ».
 */
export interface ResultsPhrase {
  text: string
  kind: 'winner' | 'loser' | 'tie'
  gap?: ResultGap | ResultGap[]
}

export const RESULTS_PHRASES: ResultsPhrase[] = [
  // Gagnant
  { kind: 'winner', text: '{winner} remporte la manche 👑' },
  { kind: 'winner', text: 'Victoire de {winner} ! Sortez les confettis 🎉' },
  { kind: 'winner', text: '{winner} gagne sur le fil, avec {gap} d’avance 😮‍💨', gap: 'small' },
  { kind: 'winner', text: '{winner} gagne avec {gap} d’avance. Propre 😎', gap: 'medium' },
  { kind: 'winner', text: 'Victoire écrasante de {winner} : {gap} d’écart 🏆', gap: 'large' },
  // Perdant
  { kind: 'loser', text: '{loser}, c’est l’heure du gage 😭' },
  { kind: 'loser', text: 'Dur dur, {loser}… Mais la revanche a déjà commencé 😤' },
  { kind: 'loser', text: '😈 {loser}, au programme : {stake}' },
  { kind: 'loser', text: 'Perdu de {gap}, {loser}… Ça s’est joué à un biscuit près 🍪', gap: 'small' },
  // Égalité
  { kind: 'tie', text: 'Égalité ! Gage pour les deux 🤝' },
  { kind: 'tie', text: 'Impossible de vous départager : {winner} et {loser}, gage pour tout le monde 😅' },
  { kind: 'tie', text: 'Ex æquo ! Vous êtes vraiment faits l’un pour l’autre 💞' },
  { kind: 'tie', text: 'Égalité parfaite 🤝 Au programme pour les deux : {stake}' },
]
