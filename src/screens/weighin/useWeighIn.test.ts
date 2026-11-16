import { describe, expect, it } from 'vitest'
import { weighInBucket, weighInReaction } from '../../core/taunts'
import { nextWeighInDate, previewWeighIn } from './useWeighIn'

describe('previewWeighIn', () => {
  it('une perte de −0,995 % arrondie à 100 pts n’est pas une « zone objectif »', () => {
    const p = previewWeighIn(79.6, 80.4, 80.4, null)
    expect(p.points).toBe(100)
    expect(p.inGoalZone).toBe(false)
    expect(weighInBucket(p.changePct, p.points, p.inGoalZone)).toBe('max')
  })

  it('dans la zone objectif avec une petite perte : réaction 🎯', () => {
    const p = previewWeighIn(79.2, 79.5, 84, 79)
    expect(p.inGoalZone).toBe(true)
    expect(p.points).toBe(100)
    expect(weighInBucket(p.changePct, p.points, p.inGoalZone)).toBe('goal')
    expect(weighInReaction(p.changePct, p.points, '2026-11-22', p.inGoalZone).text).toMatch(/objectif/i)
  })

  it('première pesée : point de départ, 0 pt', () => {
    const p = previewWeighIn(80, null, null, 75)
    expect(p.first).toBe(true)
    expect(p.points).toBe(0)
    expect(p.fromStartPct).toBe(0)
  })
})

describe('nextWeighInDate', () => {
  const settings = { weighInDays: [] }
  it('aujourd’hui le jour J, sinon le prochain dimanche', () => {
    expect(nextWeighInDate('2026-11-22', settings)).toBe('2026-11-22')
    expect(nextWeighInDate('2026-11-18', settings)).toBe('2026-11-22')
    expect(nextWeighInDate('2026-11-23', settings)).toBe('2026-11-29')
  })
})
