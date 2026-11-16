import { describe, expect, it } from 'vitest'
import { DEFAULT_GAGES } from '../config/defaults'
import { addDays } from './dates'
import { drawStake } from './stake'

const MON = '2026-11-23'

describe('🎲 drawStake : tirage de l’enjeu du lundi', () => {
  it('déterministe : même liste + même lundi = même gage (les deux téléphones tirent pareil)', () => {
    const a = drawStake(DEFAULT_GAGES, MON)
    expect(a).not.toBeNull()
    expect(DEFAULT_GAGES).toContain(a)
    expect(drawStake([...DEFAULT_GAGES], MON)).toBe(a)
  })
  it('change d’une manche à l’autre', () => {
    const drawn = new Set(Array.from({ length: 20 }, (_, i) => drawStake(DEFAULT_GAGES, addDays(MON, i * 7))))
    expect(drawn.size).toBeGreaterThanOrEqual(4)
  })
  it('liste vide (ou que des blancs) → null', () => {
    expect(drawStake([], MON)).toBeNull()
    expect(drawStake(['', '   '], MON)).toBeNull()
  })
  it('ignore les blancs et nettoie les espaces', () => {
    expect(drawStake(['  ', ' Massage 💆 '], MON)).toBe('Massage 💆')
  })
})

describe('drawStake : pas deux fois le même gage', () => {
  it("évite l'enjeu de la manche d'avant quand il y a le choix", () => {
    const gages = ['A', 'B', 'C']
    for (const ws of ['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14']) {
      const first = drawStake(gages, ws)!
      expect(drawStake(gages, ws, first)).not.toBe(first)
      expect(drawStake(gages, ws, first)).toBe(drawStake(gages, ws, first))
    }
  })
  it('garde le seul gage disponible', () => {
    expect(drawStake(['A'], '2026-11-23', 'A')).toBe('A')
  })
})
