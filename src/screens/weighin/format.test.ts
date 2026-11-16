import { describe, expect, it } from 'vitest'
import { clampTenths, KG_RANGE_TEXT, parseWeightInput, shortDay, tenthsLabel } from './format'

describe('parseWeightInput', () => {
  it('lit les poids tapés à la française ou à l’anglaise', () => {
    expect(parseWeightInput('82,3')).toEqual({ ok: true, tenths: 823, guessed: false })
    expect(parseWeightInput('82.3 kg')).toEqual({ ok: true, tenths: 823, guessed: false })
    expect(parseWeightInput(' 80 ')).toEqual({ ok: true, tenths: 800, guessed: false })
    expect(parseWeightInput('82,34')).toEqual({ ok: true, tenths: 823, guessed: false })
  })

  it('accepte les bornes', () => {
    expect(parseWeightInput('30')).toEqual({ ok: true, tenths: 300, guessed: false })
    expect(parseWeightInput('250')).toEqual({ ok: true, tenths: 2500, guessed: false })
  })

  it('devine une virgule oubliée seulement si le résultat est plausible', () => {
    expect(parseWeightInput('823')).toEqual({ ok: true, tenths: 823, guessed: true })
    expect(parseWeightInput('1052')).toEqual({ ok: true, tenths: 1052, guessed: true })
    expect(parseWeightInput('8234')).toEqual({ ok: true, tenths: 823, guessed: true })
  })

  it('refuse un poids hors bornes au lieu de le ramener à 30 ou 250 kg', () => {
    expect(parseWeightInput('8,2')).toEqual({ ok: false, reason: 'range' })
    expect(parseWeightInput('25')).toEqual({ ok: false, reason: 'range' })
    expect(parseWeightInput('250,1')).toEqual({ ok: false, reason: 'range' })
    expect(parseWeightInput('26000')).toEqual({ ok: false, reason: 'range' })
  })

  it('ignore une saisie vide ou illisible', () => {
    expect(parseWeightInput('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseWeightInput('kg')).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('formats de la pesée', () => {
  it('message des bornes tiré des règles', () => {
    expect(KG_RANGE_TEXT).toBe('Entre 30 et 250 kg 🙃')
  })

  it('dixièmes de kg', () => {
    expect(tenthsLabel(834)).toBe('83,4')
    expect(clampTenths(10)).toBe(300)
    expect(clampTenths(9999)).toBe(2500)
  })

  it('« 1er » pour le premier du mois', () => {
    expect(shortDay('2026-11-01')).toBe('dim. 1er nov.')
    expect(shortDay('2026-11-01', true)).toBe('Dim. 1er nov.')
    expect(shortDay('2026-11-15')).toBe('dim. 15 nov.')
  })
})
