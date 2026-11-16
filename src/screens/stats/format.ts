/**
 * Formats et textes propres à l'écran Stats. Les outils partagés (dates, pluriels,
 * élisions, typographie) sont dans core/fr.ts, les couleurs dans ui/color.ts.
 */
import { diffDays } from '../../core/dates'
import { frDayMonth, NBSP, typo } from '../../core/fr'
import type { DayKey, Player } from '../../core/types'

/** Pourcentage d'axe à la française : « 0 % », « −1 % », « −0,5 % », « +2 % ». */
export function axisPct(v: number): string {
  const rounded = Math.round(v * 10) / 10
  if (rounded === 0) return `0${NBSP}%`
  const abs = Math.abs(rounded)
  const txt = Number.isInteger(abs) ? String(abs) : abs.toFixed(1).replace('.', ',')
  return `${rounded < 0 ? '−' : '+'}${txt}${NBSP}%`
}

/**
 * Quand tombe le prochain verdict (un lundi), vu d'aujourd'hui :
 * « lundi » (cette semaine), « lundi prochain » (on est lundi), « lundi 30 novembre » (plus loin).
 */
export function verdictLabel(today: DayKey, verdict: DayKey): string {
  const n = diffDays(today, verdict)
  if (n === 7) return 'lundi prochain'
  if (n > 7) return `lundi ${frDayMonth(verdict, 'MMMM')}`
  return 'lundi'
}

/** Score du bilan, insécable : « 2 – 1 ». */
export function scoreLine(a: number, b: number): string {
  return `${a}${NBSP}–${NBSP}${b}`
}

/**
 * Phrase taquine (jamais méchante) selon qui mène au bilan, du point de vue du joueur connecté.
 * `verdict` : quand tombe le premier verdict (voir verdictLabel), utilisé tant que rien n'est joué.
 */
export function recordLine(me: Player, other: Player, mine: number, theirs: number, played: number, verdict: string): string {
  if (played === 0) return typo(`Le tableau est encore vierge… premier verdict ${verdict} 👀`)
  const pick = (list: string[]) => typo(list[played % list.length])
  const score = mine >= theirs ? scoreLine(mine, theirs) : scoreLine(theirs, mine)
  if (mine > theirs) {
    return pick([
      `Tu mènes ${score}. Pas le moment de t’endormir sur tes lauriers 😏`,
      `${score} pour toi ! ${other.name} prépare sa revanche, méfiance 👀`,
      `En tête du bilan 👑 Garde la couronne bien vissée, ${me.name}.`,
    ])
  }
  if (mine < theirs) {
    return pick([
      `${other.name} mène ${score}… la remontada, c’est un état d’esprit 🚀`,
      `${score} pour ${other.name}. Rien n’est perdu, tout est à reprendre 💪`,
      `À la traîne au bilan ? Parfait, les meilleures histoires commencent comme ça 🍿`,
    ])
  }
  return pick([`${mine} partout ! Tout se joue maintenant 🤝🔥`, `Égalité parfaite au bilan. Qui va craquer en premier ? 😈`])
}
