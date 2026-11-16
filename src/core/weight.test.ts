import { describe, expect, it } from 'vitest'
import { deriveWeighIns, formatKg, formatPct, lastWeighInBefore, weighInsOf } from './weight'
import { A, L } from './test-helpers'

const NBSP = ' '

describe('deriveWeighIns', () => {
  const raw = [
    { playerId: A, day: '2026-11-08', weightKg: 79.2 },
    { playerId: A, day: '2026-10-25', weightKg: 80 },
    { playerId: L, day: '2026-10-25', weightKg: 64 },
    { playerId: A, day: '2026-11-01', weightKg: 80.4 },
    { playerId: L, day: '2026-11-08', weightKg: 63.36 },
  ]

  it('variations en % par rapport à la pesée précédente et au départ', () => {
    const w = deriveWeighIns(raw, () => null)
    const arthus = weighInsOf(w, A)
    expect(arthus.map((x) => x.day)).toEqual(['2026-10-25', '2026-11-01', '2026-11-08'])
    expect(arthus[0]).toMatchObject({ changePct: null, fromStartPct: 0, goalDistancePct: null, weightKg: 80 })
    expect(arthus[1].changePct).toBeCloseTo(0.5, 10)
    expect(arthus[1].fromStartPct).toBeCloseTo(0.5, 10)
    expect(arthus[2].changePct).toBeCloseTo(-1.49254, 4)
    expect(arthus[2].fromStartPct).toBeCloseTo(-1, 10)
  })

  it('une semaine sans pesée : la suivante se compare à la dernière existante', () => {
    const laetitia = weighInsOf(deriveWeighIns(raw, () => null), L)
    expect(laetitia).toHaveLength(2)
    expect(laetitia[1].changePct).toBeCloseTo(-1, 10)
  })

  it('kilos masqués pour l’autre, les % restent visibles', () => {
    const w = deriveWeighIns(raw, () => null, (pid) => pid === A)
    expect(weighInsOf(w, L).every((x) => x.weightKg === null)).toBe(true)
    expect(weighInsOf(w, L)[1].fromStartPct).toBeCloseTo(-1, 10)
    expect(weighInsOf(w, A).every((x) => x.weightKg !== null)).toBe(true)
  })

  it('écart à l’objectif en vigueur ce jour-là', () => {
    const goalAt = (pid: string, day: string) => (pid === A ? (day >= '2026-11-02' ? 79 : 75) : null)
    const w = weighInsOf(deriveWeighIns(raw, goalAt), A)
    expect(w[0].goalDistancePct).toBeCloseTo(((80 - 75) / 75) * 100, 10)
    expect(w[2].goalDistancePct).toBeCloseTo(((79.2 - 79) / 79) * 100, 10)
    expect(weighInsOf(deriveWeighIns(raw, goalAt), L)[0].goalDistancePct).toBeNull()
  })

  it('résultat trié par jour puis par joueur', () => {
    const w = deriveWeighIns(raw, () => null)
    expect(w.map((x) => `${x.day}|${x.playerId}`)).toEqual([
      '2026-10-25|arthus',
      '2026-10-25|laetitia',
      '2026-11-01|arthus',
      '2026-11-08|arthus',
      '2026-11-08|laetitia',
    ])
  })

  it('aucune pesée', () => {
    expect(deriveWeighIns([], () => null)).toEqual([])
  })
})

describe('lastWeighInBefore', () => {
  const w = deriveWeighIns(
    [
      { playerId: A, day: '2026-10-25', weightKg: 80 },
      { playerId: A, day: '2026-11-08', weightKg: 79 },
    ],
    () => null,
  )
  it('la dernière pesée strictement avant le jour', () => {
    expect(lastWeighInBefore(w, A, '2026-11-08')?.day).toBe('2026-10-25')
    expect(lastWeighInBefore(w, A, '2026-11-09')?.day).toBe('2026-11-08')
    expect(lastWeighInBefore(w, A, '2026-10-25')).toBeNull()
    expect(lastWeighInBefore(w, L, '2026-12-01')).toBeNull()
  })
})

describe('formatage à la française', () => {
  it('formatPct : signe, virgule, espace insécable', () => {
    expect(formatPct(-0.8)).toBe(`−0,8${NBSP}%`)
    expect(formatPct(0.3)).toBe(`+0,3${NBSP}%`)
    expect(formatPct(-1.25, 2)).toBe(`−1,25${NBSP}%`)
    expect(formatPct(-2, 0)).toBe(`−2${NBSP}%`)
    expect(formatPct(-12.345)).toBe(`−12,3${NBSP}%`)
  })
  it('formatPct : 0 sans signe (même −0,04 arrondi)', () => {
    expect(formatPct(0)).toBe(`0${NBSP}%`)
    expect(formatPct(-0.04)).toBe(`0${NBSP}%`)
    expect(formatPct(0.04)).toBe(`0${NBSP}%`)
  })
  it('formatPct : valeur absente', () => {
    expect(formatPct(null)).toBe('—')
    expect(formatPct(undefined)).toBe('—')
    expect(formatPct(Number.NaN)).toBe('—')
  })
  it('formatKg', () => {
    expect(formatKg(72.4)).toBe(`72,4${NBSP}kg`)
    expect(formatKg(80)).toBe(`80,0${NBSP}kg`)
    expect(formatKg(null)).toBe(`—${NBSP}kg`)
  })
})
