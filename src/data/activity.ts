/**
 * 🔔 Textes des petits toasts « l'autre vient de faire quelque chose » (Activity de source.ts).
 * Partagés par DemoSource et SupabaseSource : un seul endroit pour le ton et la typographie.
 * Module pur : aucune dépendance au navigateur ni à la base.
 */
import { RULES } from '../config/rules'
import { typo } from '../core/fr'
import type { PlayerId } from '../core/types'
import type { Activity } from './source'

/** « check‑in » avec un trait d'union insécable : jamais coupé en fin de ligne. */
export const CHECKIN_WORD = 'check‑in'

export type ActivityKind = Activity['kind']

export interface ActivityTextOptions {
  /** gage_paid : l'autre a validé (true) ou annulé (false) « Gage payé ✅ » de MON gage. */
  paid?: boolean
  /**
   * proposal_accepted : vrai si la proposition a été acceptée d'office (sans accord de l'autre,
   * RULES.proposals.requireApproval = false). C'est alors l'auteur qui a changé la règle.
   */
  autoAccepted?: boolean
}

/**
 * Le texte du toast, à partir de ce qu'a fait l'autre et de son prénom (actuel).
 * Ex. activityText('checkin_done', 'Laetitia') → « 👀 Laetitia vient de faire son check‑in ».
 */
export function activityText(kind: ActivityKind, name: string, opts: ActivityTextOptions = {}): string {
  const who = name.trim() || 'L’autre'
  switch (kind) {
    case 'checkin_done':
      return typo(`👀 ${who} vient de faire son ${CHECKIN_WORD}`)
    case 'checkin':
      return typo(`✏️ ${who} retouche son ${CHECKIN_WORD}`)
    case 'weighin':
      return typo(`⚖️ ${who} vient de passer sur la balance`)
    case 'proposal':
      return typo(`📬 ${who} propose un changement de règle : à toi de trancher`)
    case 'proposal_accepted':
      return (opts.autoAccepted ?? !RULES.proposals.requireApproval)
        ? typo(`📜 ${who} a changé une règle (effet lundi)`)
        : typo(`🤝 ${who} a accepté ta proposition (effet lundi)`)
    case 'proposal_refused':
      return typo(`🙅 ${who} a refusé ta proposition`)
    case 'stake':
      return typo(`🎲 ${who} a changé l’enjeu de la semaine`)
    case 'gage_paid':
      return opts.paid === false ? typo(`↩️ ${who} a annulé « Gage payé » pour toi`) : typo(`🫡 ${who} a validé ton gage, dette effacée`)
    case 'profile':
      return typo(`✨ ${who} a retouché son profil`)
  }
}

/** L'Activity complète (kind + joueur + texte prêt à afficher). */
export function makeActivity(kind: ActivityKind, playerId: PlayerId, name: string, opts: ActivityTextOptions = {}): Activity {
  return { kind, playerId, text: activityText(kind, name, opts) }
}
