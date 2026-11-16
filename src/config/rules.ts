/**
 * ⚙️ RÈGLES DU DUEL — le seul fichier à modifier pour changer le jeu.
 *
 * Toute la logique de score (src/core) lit ces valeurs : changer un nombre ici
 * change le calcul partout (Ring, résultats, stats, badges, tests).
 * La date de début du duel (SEASON_START), les joueurs, habitudes et gages de départ
 * sont dans src/config/defaults.ts.
 * Pense à mettre SPEC.md à jour si tu changes une règle.
 */
export const RULES = {
  /** Fuseau horaire de référence pour les jours et les manches. */
  timezone: 'Europe/Paris',

  /** Une manche = une semaine, du lundi 00:00 au dimanche 23:59 (heure de Paris). */
  week: {
    /** Nombre de jours notés dans une manche. */
    days: 7,
    /** Score maximum d'une journée (le score du jour est ramené sur 100). */
    dailyMax: 100,
  },

  /** Check-in quotidien : points par réponse. */
  checkin: {
    /** Habitude « à éviter » : 😇 Nickel · 😬 Un peu · 🙈 Craquage. */
    avoid: { nickel: 10, unpeu: 5, craquage: 0 },
    /** Habitude « à faire » : 💪 Fait · 🛋️ Pas fait. */
    do: { fait: 10, pasfait: 0 },
    /** Nombre de jours de rattrapage : 1 = on peut remplir aujourd'hui et hier. */
    catchUpDays: 1,
    /**
     * La manche est close le dimanche à 23:59 : le lundi, on ne peut plus
     * rattraper le dimanche (décision du 16/11/2026).
     */
    catchUpAcrossWeeks: false,
  },

  /** Pesée hebdomadaire, comparée en % à la pesée précédente. */
  weighIn: {
    /** Jour de la pesée par défaut (1 = lundi … 7 = dimanche). */
    defaultDay: 7,
    /** Points maximum de la pesée. */
    maxPoints: 100,
    /** Perte (en %) qui donne le maximum de points. Au-delà, plafond : pas de bonus. */
    fullPointsLossPct: 1,
    /** Être à ± ce % de son poids objectif rapporte le maximum de points. */
    goalTolerancePct: 1,
    /** Pesée autorisée uniquement le jour J (corrigeable jusqu'à 23:59 ce jour-là). */
    onlyOnWeighInDay: true,
    /** Pas du sélecteur de poids, en kg. */
    stepKg: 0.1,
    /** Bornes de saisie, en kg (garde-fou contre les fautes de frappe). */
    minKg: 30,
    maxKg: 250,
  },

  /** Enjeu de la semaine (le gage). */
  stake: {
    /**
     * Tirage automatique à la roulette au début de la manche s'il n'y a pas d'enjeu
     * (décision 4). Lu par la source de données, qui tire avec drawStake() (core/stake.ts).
     */
    autoDrawOnMonday: true,
    /** L'enjeu reste modifiable pendant ce nombre de jours (1 = le lundi seulement). */
    editableDays: 1,
  },

  /**
   * Changements de règles (ajout / désactivation / type d'habitude, jour de la pesée,
   * poids objectif) : proposés par l'un, acceptés par l'autre, effectifs le lundi suivant.
   */
  proposals: {
    /** Faux = une proposition est acceptée d'office (lu par la source de données). */
    requireApproval: true,
  },

  /** Seuils des badges. */
  badges: {
    /** 💅 🧘 🔒 : jours d'affilée « Nickel » sur l'habitude. */
    cleanStreakDays: 7,
    /** 🏋️ Machine : jours de sport dans la même manche. */
    sportDaysPerWeek: 5,
    /** 📅 Assidu·e : jours d'affilée avec un check-in complet. */
    assiduousDays: 7,
    /** 🪶 Plume : paliers de perte depuis la première pesée (en %). */
    featherTiersPct: [2, 5, 10],
    /** 🚀 Remontada : jour (1 = lundi … 7 = dimanche) au soir duquel on est mené. */
    comebackCheckDay: 4,
    /** 👑 Série royale : manches gagnées d'affilée. */
    royalStreakWeeks: 3,
    /** 🔥 Inarrêtable : jours d'affilée « Nickel » sur une même habitude à éviter. */
    unstoppableDays: 30,
  },
}

export type Rules = typeof RULES
