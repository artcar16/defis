/**
 * Textes de la galerie de badges : progression, dates, astuces, taquineries.
 * Tout est en français familier, jamais méchant, et jamais sur le physique ou le poids.
 * Les seuils viennent de RULES.badges ; chaque texte passe par typo() (espaces insécables).
 */
import { RULES } from '../../config/rules'
import type { BadgeId, BadgeState } from '../../core/badges'
import { addDays, isoDayName } from '../../core/dates'
import { deName, frDayMonth, NBSP, plural, pluralWord, typo } from '../../core/fr'
import type { DayKey } from '../../core/types'
import { formatPct } from '../../core/weight'

const B = RULES.badges

/** Le soir où l'on regarde qui mène pour 🚀 Remontada (« jeudi »). */
const COMEBACK_DAY = isoDayName(B.comebackCheckDay)

/** typo(), et l'emoji final reste collé au mot d'avant (jamais seul en début de ligne). */
function polish(s: string): string {
  return typo(s).replace(/ (?=\S+$)/u, NBSP)
}

/** « 12 nov. », « 1er novembre » : le jour et le mois ne se séparent jamais en fin de ligne. */
export function dayMonth(day: DayKey, month: 'MMM' | 'MMMM' = 'MMM'): string {
  return frDayMonth(day, month).replace(' ', NBSP)
}

/** « Débloqué le 12 nov. », « Débloqué le 1er novembre » (ou « aujourd’hui » / « hier »). */
export function unlockedLabel(day: DayKey, today: DayKey, long = false): string {
  if (day === today) return `Débloqué aujourd’hui${NBSP}🎉`
  if (day === addDays(today, -1)) return 'Débloqué hier'
  return `Débloqué le ${dayMonth(day, long ? 'MMMM' : 'MMM')}`
}

/** Le badge a des paliers (🪶 Plume). */
export function isTiered(b: BadgeState): boolean {
  return (b.tiers?.length ?? 0) > 0
}

/** Badge « tout ou rien », sans barre de progression qui ait du sens (🚀). */
export function isBinary(b: BadgeState): boolean {
  return b.id === 'remontada'
}

/** Pourcentage de progression vers le déblocage (0-1). */
export function progressRatio(b: BadgeState): number {
  return b.progress.target > 0 ? Math.min(1, b.progress.current / b.progress.target) : 0
}

/** Progression lisible, ex. « 4 / 7 jours », « −1,4 % / −2 % ». `null` si ça n'a pas de sens. */
export function progressText(b: BadgeState): { value: string; unit: string } | null {
  const { current, target } = b.progress
  switch (b.id) {
    case 'plume':
      return { value: `${current > 0 ? formatPct(-current / 10) : formatPct(0)} / ${formatPct(-target / 10, 0)}`, unit: '' }
    case 'remontada':
      return null
    case 'royale':
      return { value: `${current} / ${target}`, unit: pluralWord(target, 'manche') }
    default:
      return { value: `${current} / ${target}`, unit: pluralWord(target, 'jour') }
  }
}

/** Ce que mesure la progression, pour la fiche détaillée. */
export function progressCaption(id: BadgeId): string {
  switch (id) {
    case 'manucure':
    case 'zen':
    case 'frigo':
      return typo('Série en cours de « 😇 Nickel »')
    case 'machine':
      return 'Jours de sport cette manche'
    case 'assidu':
      return 'Check-ins complets d’affilée'
    case 'plume':
      return 'Depuis le départ'
    case 'remontada':
      return 'Le coup parfait'
    case 'royale':
      return 'Manches gagnées d’affilée'
    case 'inarretable':
      return typo('Meilleure série « 😇 Nickel » en cours')
  }
}

/**
 * Petit encouragement sous la barre de progression.
 * `who` = null pour le joueur connecté, sinon le prénom de l'autre.
 */
export function remainingText(b: BadgeState, who: string | null): string {
  return polish(remainingRaw(b, who))
}

function remainingRaw(b: BadgeState, who: string | null): string {
  const left = Math.max(0, b.progress.target - b.progress.current)
  /** « Encore 3 jours… 💪 » pour moi, « Encore 3 jours… pour Laetitia 👀 » pour l'autre. */
  const forWho = (txt: string, emoji: string) => (who === null ? `${txt} ${emoji}` : `${txt} pour ${who} 👀`)
  switch (b.id) {
    case 'manucure':
    case 'zen':
    case 'frigo':
    case 'inarretable':
      if (b.progress.current === 0) {
        return who === null
          ? 'La série démarre au prochain « 😇 Nickel » 💪'
          : `La série ${deName(who)} démarre au prochain « 😇 Nickel » 👀`
      }
      return forWho(`Encore ${plural(left, 'jour')} « Nickel » d’affilée`, b.id === 'inarretable' ? '🐢' : '💪')
    case 'assidu':
      return forWho(`Encore ${plural(left, 'check-in complet', 'check-ins complets')} d’affilée`, '📅')
    case 'machine':
      // `possible` : séances encore jouables cette manche (calculé par computeBadges).
      if (left > (b.progress.possible ?? left)) {
        return who === null
          ? 'Plus assez de jours cette manche… rendez-vous lundi 😅'
          : `Plus assez de jours pour ${who} cette manche… rendez-vous lundi 👀`
      }
      return forWho(`Encore ${plural(left, 'séance')} de sport cette manche`, '🏋️')
    case 'plume': {
      const next = b.tiers?.find((t) => t.unlockedOn === null)
      if (!next) return who === null ? 'Tous les paliers sont débloqués 🪶' : `${who} a débloqué tous les paliers 👀`
      return who === null ? `Prochain palier : ${next.label} 🪶` : `Prochain palier ${deName(who)} : ${next.label} 👀`
    }
    case 'remontada':
      return who === null
        ? `Être mené·e le ${COMEBACK_DAY} soir… puis tout renverser 😈`
        : `Si ${who} est mené·e ${COMEBACK_DAY} soir… méfiance 👀`
    case 'royale':
      return forWho(`Encore ${plural(left, 'victoire')} d’affilée`, '👑')
  }
}

/** Applique typo() à chaque texte. */
function withTypo(texts: Record<BadgeId, string>): Record<BadgeId, string> {
  return Object.fromEntries(Object.entries(texts).map(([id, text]) => [id, typo(text)])) as Record<BadgeId, string>
}

/** « Comment l’obtenir ? » : explication des règles, neutre (valable pour les deux joueurs). */
export const HOW_TO = withTypo({
  manucure: `Répondre « 😇 Nickel » sur les ongles ${plural(B.cleanStreakDays, 'jour')} de suite. Un « Un peu », un craquage ou un jour oublié, et la série repart de zéro.`,
  zen: `Répondre « 😇 Nickel » sur le grattage ${plural(B.cleanStreakDays, 'jour')} de suite. Un « Un peu », un craquage ou un jour oublié, et la série repart de zéro.`,
  frigo: `Répondre « 😇 Nickel » sur le grignotage ${plural(B.cleanStreakDays, 'jour')} de suite. Le frigo reste fermé entre les repas !`,
  machine: `Cocher « 💪 Fait » au sport au moins ${plural(B.sportDaysPerWeek, 'jour')} dans la même manche (du lundi au dimanche). Ça se regagne chaque semaine.`,
  assidu: `Remplir toutes ses habitudes ${plural(B.assiduousDays, 'jour')} d’affilée. Un jour oublié casse la série.`,
  plume: `Se débloque à la pesée, en % depuis la pesée de départ, par paliers : ${B.featherTiersPct.map((p) => formatPct(-p, 0)).join(', ')}. Pas de régime express : la régularité paie.`,
  remontada: `Être strictement mené·e au total du lundi au ${COMEBACK_DAY} soir, puis gagner la manche dimanche.`,
  royale: `Gagner ${plural(B.royalStreakWeeks, 'manche')} d’affilée. Une égalité ou une défaite casse la série.`,
  inarretable: `${plural(B.unstoppableDays, 'jour')} d’affilée « 😇 Nickel » sur une même habitude à éviter. Le badge des légendes.`,
})

/** Pourquoi un badge ne concerne pas ce joueur. */
export function notApplicableText(id: BadgeId, name: string | null): string {
  const habit: Partial<Record<BadgeId, string>> = {
    manucure: 'ongles',
    zen: 'grattage',
    frigo: 'grignotage',
    machine: 'sport',
  }
  const h = habit[id]
  const subject = name === null ? 'Tu n’as' : `${name} n’a`
  if (h) return polish(`${subject} pas d’habitude « ${h} » à suivre. Tranquille 😌`)
  return polish(name === null ? 'Ce badge ne te concerne pas pour l’instant 🤷' : `Ce badge ne concerne pas ${name} pour l’instant 🤷`)
}

/** La phrase qui claque dans la cérémonie de déblocage (sur l'habitude, jamais sur le physique). */
export function bragLine(id: BadgeId, otherName: string): string {
  return polish(bragRaw(id, otherName))
}

function bragRaw(id: BadgeId, otherName: string): string {
  switch (id) {
    case 'manucure':
      return 'Pas un seul ongle rongé. La classe 💅'
    case 'zen':
      return 'Même pas une petite gratouille. Respect 🧘'
    case 'frigo':
      return 'Le frigo n’a rien vu venir 🔒'
    case 'machine':
      return 'Une vraie machine, rien ne t’arrête 🏋️'
    case 'assidu':
      return 'Pas un seul oubli. Chapeau 📅'
    case 'plume':
      return 'La régularité, ça paie 🪶'
    case 'remontada':
      return `Le retour du siècle. ${otherName} s’en souviendra 😈`
    case 'royale':
      return `${plural(B.royalStreakWeeks, 'manche')} d’affilée. Incline-toi, ${otherName} 👑`
    case 'inarretable':
      return `${plural(B.unstoppableDays, 'jour')} sans faillir. Légendaire 🔥`
  }
}

/** Phrase taquine qui compare les deux vitrines. */
export function showcaseLine(otherName: string, mine: number, theirs: number): string {
  const d = Math.abs(mine - theirs)
  if (mine === 0 && theirs === 0) return polish('Vitrines vides des deux côtés… qui ouvre le bal ? 👀')
  if (mine === theirs) return polish('Égalité dans les vitrines. Le prochain badge fera la différence 👀')
  if (mine > theirs) return polish(`Tu as ${plural(d, 'badge')} d’avance sur ${otherName}. Frime pas trop 😎`)
  return polish(`${otherName} a ${plural(d, 'badge')} d’avance… à toi de briller ✨`)
}
