/**
 * Valeurs de départ : joueurs, habitudes et gages.
 * Elles servent à la création des données (démo et Supabase), puis tout est
 * modifiable dans l'app (Réglages).
 */
import type { BadgeHabitKey, DayKey, HabitKind } from '../core/types'

/**
 * 🏁 Date de début du vrai duel (décision 14 de SPEC.md) : le LUNDI de la première manche.
 * À ajuster à l'étape 4 (Supabase), au moment de créer les données. Conseil : faire la
 * pesée de départ le dimanche d'avant. La démo la remplace (elle commence 3 manches
 * avant la semaine en cours). Un test vérifie que c'est bien un lundi.
 */
export const SEASON_START: DayKey = '2026-11-23'

export interface DefaultPlayer {
  key: 'laetitia' | 'arthus'
  name: string
  emoji: string
  color: string
}

export const DEFAULT_PLAYERS: DefaultPlayer[] = [
  { key: 'laetitia', name: 'Laetitia', emoji: '🦊', color: '#FF6F61' },
  { key: 'arthus', name: 'Arthus', emoji: '🐻', color: '#2E6BFF' },
]

export interface DefaultHabit {
  /** À qui appartient l'habitude (chaque joueur a sa propre copie). */
  owners: DefaultPlayer['key'][]
  name: string
  hint: string
  emoji: string
  kind: HabitKind
  badgeKey: BadgeHabitKey | null
}

export const DEFAULT_HABITS: DefaultHabit[] = [
  { owners: ['arthus'], name: 'Ongles', hint: 'Ne pas se les ronger', emoji: '💅', kind: 'avoid', badgeKey: 'ongles' },
  { owners: ['laetitia'], name: 'Grattage', hint: 'Ne pas se gratter', emoji: '🦟', kind: 'avoid', badgeKey: 'grattage' },
  { owners: ['laetitia', 'arthus'], name: 'Grignotage', hint: 'En dehors des repas', emoji: '🍪', kind: 'avoid', badgeKey: 'grignotage' },
  { owners: ['laetitia', 'arthus'], name: 'Sport', hint: '30 min d’activité minimum', emoji: '🏃', kind: 'do', badgeKey: 'sport' },
]

/** Idées d'habitudes proposées dans les réglages. */
export const HABIT_IDEAS: { name: string; emoji: string; kind: HabitKind }[] = [
  { name: 'Eau', emoji: '💧', kind: 'do' },
  { name: 'Alcool', emoji: '🍷', kind: 'avoid' },
  { name: 'Sommeil', emoji: '😴', kind: 'do' },
  { name: 'Écrans au lit', emoji: '📱', kind: 'avoid' },
  { name: 'Légumes', emoji: '🥦', kind: 'do' },
  { name: 'Sucre', emoji: '🍬', kind: 'avoid' },
]

/**
 * Liste de gages de départ pour la roulette 🎲. Un gage est fait par qui perd la manche
 * (par les deux en cas d'égalité) : chaque texte doit être clair sur qui en profite
 * (« l’autre » = qui a gagné), sans rien de genré.
 */
export const DEFAULT_GAGES: string[] = [
  'Vaisselle pendant une semaine 🍽️',
  'Offrir un massage de 15\u00a0min 💆',
  'Laisser l’autre choisir le film du week-end 🎬',
  'Servir le petit-déj au lit 🥐',
  'Corvée de courses 🛒',
  'Cuisiner le dîner choisi par l’autre 🧑‍🍳',
  'Ménage de la salle de bain 🧽',
  'Une soirée sans téléphone 📵',
]

/** Emojis proposés pour les avatars. */
export const AVATAR_EMOJIS = ['🦊', '🐻', '🐯', '🐼', '🐨', '🐸', '🦁', '🐵', '🦄', '🐙', '🐧', '🦖', '🐰', '🐶', '🐱', '🦉']

/** Couleurs proposées pour les joueurs. */
export const PLAYER_COLORS = ['#FF6F61', '#2E6BFF', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#EF4444']

/** Emojis proposés pour les habitudes. */
export const HABIT_EMOJIS = ['💅', '🦟', '🍪', '🏃', '💧', '🍷', '😴', '📱', '🥦', '🍬', '🚭', '🧘', '📚', '🚶', '🍔', '☕', '🛌', '🦷']
