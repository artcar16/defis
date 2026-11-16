/**
 * 🎲 Tirage de l'enjeu de la semaine (décision 4 de SPEC.md). Module pur.
 *
 * Le tirage est DÉTERMINISTE : même liste de gages + même lundi = même gage. Les deux
 * téléphones (et plus tard le serveur) tirent donc le même, sans se concerter.
 */
import { hashString } from './taunts'
import type { DayKey } from './types'

/**
 * Le gage tiré pour la manche qui commence ce lundi (null si la liste est vide).
 * `previous` (l'enjeu de la manche d'avant) est évité quand la liste en propose d'autres :
 * pas deux fois le même gage d'affilée.
 */
export function drawStake(gages: string[], weekStart: DayKey, previous: string | null = null): string | null {
  const list = gages.map((g) => g.trim()).filter(Boolean)
  if (list.length === 0) return null
  const i = hashString(`stake|${weekStart}`) % list.length
  if (previous !== null && list.length >= 2 && list[i] === previous.trim()) return list[(i + 1) % list.length]
  return list[i]
}
