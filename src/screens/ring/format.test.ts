import { describe, expect, it } from 'vitest'
import { NBSP } from '../../core/fr'
import { daysLeftLabel, deadlineLabel, greetingLine } from './format'

describe('Ring : petits textes', () => {
  it('jours restants : 0 et 1 au singulier', () => {
    expect(daysLeftLabel(1)).toBe(`1${NBSP}jour restant`)
    expect(daysLeftLabel(0)).toBe(`0${NBSP}jour restant`)
    expect(daysLeftLabel(4)).toBe(`4${NBSP}jours restants`)
  })

  it('salut : virgule du vocatif, et une vraie question la nuit', () => {
    expect(greetingLine(9, 'Laetitia')).toBe('Bonjour, Laetitia 👋')
    expect(greetingLine(14, 'Arthus')).toBe('Salut, Arthus 👋')
    expect(greetingLine(20, 'Arthus')).toBe('Bonsoir, Arthus 👋')
    expect(greetingLine(2, 'Arthus')).toBe(`Encore debout, Arthus${NBSP}? 👋`)
  })

  it('date limite de l’enjeu, vue d’aujourd’hui', () => {
    expect(deadlineLabel('2026-11-16', '2026-11-16')).toBe('minuit')
    expect(deadlineLabel('2026-11-17', '2026-11-16')).toBe(`demain${NBSP}soir`)
    expect(deadlineLabel('2026-11-18', '2026-11-16')).toBe(`mercredi${NBSP}soir`)
  })
})
