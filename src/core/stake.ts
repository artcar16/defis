/**
 * 🎲 Tirage de l'enjeu de la semaine (décision 4 de SPEC.md). Module pur.
 *
 * Le tirage est DÉTERMINISTE : même liste de gages + même lundi = même gage. Les deux
 * téléphones (et plus tard le serveur) tirent donc le même, sans se concerter.
 */
import { hashString } from './taunts'
import type { DayKey } from './types'

/** Le gage tiré pour la manche qui commence ce lundi (null si la liste est vide). */
export function drawStake(gages: string[], weekStart: DayKey): string | null {
  const list = gages.map((g) => g.trim()).filter(Boolean)
  if (list.length === 0) return null
  return list[hashString(`stake|${weekStart}`) % list.length]
}
