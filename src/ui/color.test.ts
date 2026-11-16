import { describe, expect, it } from 'vitest'
import { contrastRatio, deep, onColor, parseHex, resolveHex, themeColor, tint } from './color'

describe('contraste', () => {
  it('suit la formule WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5)
    // Le corail de Laetitia avec du blanc : 2,7:1 (mesuré par la relecture).
    expect(contrastRatio('#FF6F61', '#ffffff')).toBeCloseTo(2.73, 1)
  })

  it('lit les hex courts et longs', () => {
    expect(parseHex('#abc')).toEqual([0xaa, 0xbb, 0xcc])
    expect(parseHex('2E6BFF')).toEqual([0x2e, 0x6b, 0xff])
    expect(parseHex('var(--me)')).toBeNull()
  })
})

describe('onColor (encre des boutons)', () => {
  it('garde le bleu d’Arthus tel quel, avec une encre blanche', () => {
    expect(onColor('#2E6BFF')).toEqual({ bg: '#2E6BFF', ink: '#fff' })
  })

  it('assombrit juste assez le corail de Laetitia pour que le blanc se lise', () => {
    const { bg, ink } = onColor('#FF6F61')
    expect(ink).toBe('#fff')
    expect(bg).not.toBe('#FF6F61')
    expect(contrastRatio(bg, '#ffffff')).toBeGreaterThanOrEqual(3)
    // « Juste assez » : un pas de moins ne suffirait pas.
    const [r, g, b] = parseHex(bg)!
    const lighter = `#${[r, g, b].map((v) => Math.min(255, Math.round(v / 0.98)).toString(16).padStart(2, '0')).join('')}`
    expect(contrastRatio(lighter, '#ffffff')).toBeLessThan(3.05)
  })

  it('tient le contraste pour toutes les couleurs proposées (ambre, turquoise, émeraude…)', () => {
    for (const c of ['#FF6F61', '#2E6BFF', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#EF4444', '#22c55e']) {
      const { bg, ink } = onColor(c)
      expect(contrastRatio(bg, ink === '#fff' ? '#ffffff' : ink)).toBeGreaterThanOrEqual(3)
    }
  })

  it('passe à une encre foncée sur l’or (trop clair même assombri)', () => {
    const { bg, ink } = onColor('#ffc23d')
    expect(bg).toBe('#ffc23d')
    expect(ink).not.toBe('#fff')
    expect(contrastRatio(bg, ink)).toBeGreaterThanOrEqual(4.5)
  })

  it('laisse passer une couleur qui n’est pas en hex', () => {
    expect(onColor('color-mix(in oklab, red, blue)')).toEqual({ bg: 'color-mix(in oklab, red, blue)', ink: '#fff' })
  })
})

describe('helpers de couleur', () => {
  it('tint et deep produisent des color-mix', () => {
    expect(tint('#fff', 20)).toBe('color-mix(in oklab, #fff 20%, var(--color-surface))')
    expect(tint('#fff', 20, 'transparent')).toBe('color-mix(in oklab, #fff 20%, transparent)')
    expect(deep('#fff')).toBe('color-mix(in oklab, #fff 75%, var(--color-ink))')
  })

  it('themeColor et resolveHex se rabattent proprement hors navigateur', () => {
    expect(themeColor('gold', '#ffc23d')).toBe('#ffc23d')
    expect(themeColor('--color-gold', '#ffc23d')).toBe('#ffc23d')
    expect(resolveHex('#22c55e')).toBe('#22c55e')
    expect(resolveHex('var(--color-nickel)')).toBeNull()
  })
})
