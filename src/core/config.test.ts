/**
 * Garde-fous sur le fichier de config (src/config) : les valeurs qu'on modifie à la main.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_GAGES, SEASON_START } from '../config/defaults'
import { isoDayOf } from './dates'

describe('config', () => {
  it('SEASON_START est un lundi (décision 14)', () => {
    expect(SEASON_START).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(isoDayOf(SEASON_START)).toBe(1)
  })
  it('gages de départ : non vides, clairs sur qui en profite, rien de genré', () => {
    expect(DEFAULT_GAGES.length).toBeGreaterThanOrEqual(6)
    expect(new Set(DEFAULT_GAGES).size).toBe(DEFAULT_GAGES.length)
    for (const g of DEFAULT_GAGES) {
      expect(g.trim().length, g).toBeGreaterThan(3)
      expect(g, g).not.toMatch(/perdant|gagnant|de son choix|👩|👨/)
      expect(g, g).not.toMatch(/'/) // apostrophe courbe
    }
  })
})
