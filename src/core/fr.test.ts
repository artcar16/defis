import { describe, expect, it } from 'vitest'
import { CHECKIN_PHRASES, RESULTS_PHRASES, RING_PHRASES, WEIGHIN_REACTIONS } from '../content/phrases'
import {
  NBSP,
  capitalize,
  deName,
  formatPts,
  formatSignedPts,
  frDate,
  frDayMonth,
  joinFr,
  lowerFirst,
  plural,
  pluralWord,
  ptsUnit,
  queName,
  relativeDays,
  startsWithVowelSound,
  typo,
  weekRangeLabel,
} from './fr'

/** Rend les espaces insécables visibles dans les messages d'erreur. */
const s = (text: string) => text.replaceAll(NBSP, '_')

describe('élisions devant un prénom', () => {
  it('deName / queName', () => {
    expect(deName('Arthus')).toBe('d’Arthus')
    expect(deName('Laetitia')).toBe('de Laetitia')
    expect(queName('Arthus')).toBe('qu’Arthus')
    expect(queName('Laetitia')).toBe('que Laetitia')
    expect(deName('Écrans au lit')).toBe('d’Écrans au lit')
    expect(deName('Eau')).toBe('d’Eau')
  })
  it('voyelles, y et h', () => {
    for (const w of ['Arthus', 'Émile', 'Œdipe', 'Yves', 'habitude', 'Hier', 'huile', 'Hydratation', ' Inès']) {
      expect(startsWithVowelSound(w), w).toBe(true)
    }
    for (const w of ['Laetitia', 'Yasmine', 'Yoga', 'huit', 'Héros', '8 pts', '💧 Eau', '']) {
      expect(startsWithVowelSound(w), w).toBe(false)
    }
  })
})

describe('pluriels (0 et 1 au singulier)', () => {
  it('plural / pluralWord', () => {
    expect(plural(0, 'jour')).toBe(`0${NBSP}jour`)
    expect(plural(1, 'jour')).toBe(`1${NBSP}jour`)
    expect(plural(2, 'jour')).toBe(`2${NBSP}jours`)
    expect(plural(3, 'check-in complet', 'check-ins complets')).toBe(`3${NBSP}check-ins complets`)
    expect(pluralWord(1.5, 'jour')).toBe('jour')
    expect(pluralWord(-2, 'jour')).toBe('jours')
  })
  it('formatPts / formatSignedPts', () => {
    expect([0, 1, 2, 40].map(formatPts)).toEqual([`0${NBSP}pt`, `1${NBSP}pt`, `2${NBSP}pts`, `40${NBSP}pts`])
    expect([0, 1, 2].map(ptsUnit)).toEqual(['pt', 'pt', 'pts'])
    expect(formatSignedPts(1)).toBe(`+1${NBSP}pt`)
    expect(formatSignedPts(40)).toBe(`+40${NBSP}pts`)
    expect(formatSignedPts(-5)).toBe(`−5${NBSP}pts`)
    expect(formatSignedPts(0)).toBe(`0${NBSP}pt`)
  })
})

describe('majuscules', () => {
  it('capitalize / lowerFirst', () => {
    expect(capitalize('dimanche 22 novembre')).toBe('Dimanche 22 novembre')
    expect(capitalize('')).toBe('')
    expect(lowerFirst('Vaisselle pendant une semaine 🍽️')).toBe('vaisselle pendant une semaine 🍽️')
    expect(lowerFirst('Écrans éteints')).toBe('écrans éteints')
    expect(lowerFirst('TV interdite')).toBe('TV interdite') // un sigle reste en majuscules
    expect(lowerFirst('')).toBe('')
  })
})

describe('dates', () => {
  it('frDayMonth : « 1er » pour le premier du mois', () => {
    expect(frDayMonth('2026-11-01')).toBe('1er nov.')
    expect(frDayMonth('2026-11-16')).toBe('16 nov.')
    expect(frDayMonth('2026-11-01', 'MMMM')).toBe('1er novembre')
    expect(frDayMonth('2027-02-01')).toBe('1er févr.')
  })
  it('frDate', () => {
    expect(frDate('2026-11-22')).toBe('dimanche 22 novembre')
    expect(frDate('2026-11-01', { weekday: 'EEE', month: 'MMM' })).toBe('dim. 1er nov.')
    expect(frDate('2026-11-22', { capitalized: true })).toBe('Dimanche 22 novembre')
    expect(frDate('2026-11-22', { weekday: null })).toBe('22 novembre')
    expect(frDate('2026-11-16', { weekday: 'EEEE', month: 'MMM' })).toBe('lundi 16 nov.')
  })
  it('weekRangeLabel, sur un ou deux mois', () => {
    expect(weekRangeLabel('2026-11-16', '2026-11-22')).toBe('du 16 au 22 novembre')
    expect(weekRangeLabel('2026-10-26', '2026-11-01')).toBe('du 26 octobre au 1er novembre')
    expect(weekRangeLabel('2026-10-26', '2026-11-01', 'MMM')).toBe('du 26 oct. au 1er nov.')
    expect(weekRangeLabel('2026-12-28', '2027-01-03')).toBe('du 28 décembre au 3 janvier')
    expect(weekRangeLabel('2027-01-25', '2027-01-31')).toBe('du 25 au 31 janvier')
  })
  it('relativeDays', () => {
    const today = '2026-11-16'
    expect(relativeDays(today, today)).toBe('aujourd’hui')
    expect(relativeDays(today, '2026-11-17')).toBe('demain')
    expect(relativeDays(today, '2026-11-15')).toBe('hier')
    expect(relativeDays(today, '2026-11-22')).toBe(`dans 6${NBSP}jours`)
    expect(relativeDays(today, '2026-11-13')).toBe(`il y a 3${NBSP}jours`)
    expect(relativeDays('2026-11-29', '2026-12-01')).toBe(`dans 2${NBSP}jours`)
  })
  it('joinFr', () => {
    expect(joinFr([])).toBe('')
    expect(joinFr(['Laetitia'])).toBe('Laetitia')
    expect(joinFr(['Laetitia', 'Arthus'])).toBe('Laetitia et Arthus')
    expect(joinFr(['a', 'b', 'c'])).toBe('a, b et c')
  })
})

describe('typo : typographie française', () => {
  it('espace insécable avant ! ? ; : % » et après «', () => {
    expect(typo('Égalité ! Bravo ? Oui ; non')).toBe(`Égalité${NBSP}! Bravo${NBSP}? Oui${NBSP}; non`)
    expect(typo('Pesée : aujourd’hui')).toBe(`Pesée${NBSP}: aujourd’hui`)
    expect(typo('Score :')).toBe(`Score${NBSP}:`)
    expect(typo('−0,8 %')).toBe(`−0,8${NBSP}%`)
    expect(typo('« Nickel »')).toBe(`«${NBSP}Nickel${NBSP}»`)
    expect(typo('«Nickel»')).toBe(`«${NBSP}Nickel${NBSP}»`)
  })
  it('apostrophe courbe', () => {
    expect(typo('c\'est l\'heure')).toBe('c’est l’heure')
  })
  it('ne casse ni les heures, ni les URL, ni les émoticônes', () => {
    expect(typo('Rendez-vous à 21:30')).toBe('Rendez-vous à 21:30')
    expect(typo('https://exemple.fr')).toBe('https://exemple.fr')
    expect(typo('Trop bien :)')).toBe('Trop bien :)')
    expect(typo('Bravo!')).toBe('Bravo!') // pas d'espace ajoutée là où il n'y en a pas
  })
  it('idempotent : typo(typo(s)) === typo(s)', () => {
    const samples = [
      'Égalité ! Gage pour les deux 🤝',
      '« Nickel » : 10 pts ; « Un peu » : 5 pts ?',
      'l\'autre, 50 % ! «a» ',
      'Rendez-vous à 21:30 : ok !',
      ...Object.values(RING_PHRASES).flat().map((p) => p.text),
      ...CHECKIN_PHRASES.map((p) => p.text),
      ...Object.values(WEIGHIN_REACTIONS).flat().map((p) => p.text),
      ...RESULTS_PHRASES.map((p) => p.text),
    ]
    for (const text of samples) expect(s(typo(typo(text))), text).toBe(s(typo(text)))
  })
})
