/**
 * Petits formats partagés par l'interface (les outils de français sont dans core/fr.ts).
 */

/** Message d'erreur prêt à afficher (les sources rejettent avec un message en français). */
export function errorText(e: unknown, fallback = 'Oups, ça n’a pas marché 😵 Réessaie ?'): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  return fallback
}
