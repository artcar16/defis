import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayKeyAt,
  daysRange,
  diffDays,
  formatDay,
  hourAt,
  isoDayName,
  isoDayOf,
  isSameWeek,
  nextMonday,
  weekDays,
  weekEndOf,
  weekStartOf,
} from './dates'

describe('jours et manches', () => {
  it('isoDayOf : 1 = lundi … 7 = dimanche', () => {
    expect(isoDayOf('2026-11-16')).toBe(1)
    expect(isoDayOf('2026-11-19')).toBe(4)
    expect(isoDayOf('2026-11-22')).toBe(7)
  })
  it('weekStartOf : le lundi de la manche (dimanche → lundi précédent)', () => {
    expect(weekStartOf('2026-11-16')).toBe('2026-11-16')
    expect(weekStartOf('2026-11-19')).toBe('2026-11-16')
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16')
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23')
    // À cheval sur deux mois et deux années.
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26')
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28')
  })
  it('weekEndOf, weekDays, nextMonday', () => {
    expect(weekEndOf('2026-11-16')).toBe('2026-11-22')
    expect(weekDays('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
    expect(nextMonday('2026-11-16')).toBe('2026-11-23')
    expect(nextMonday('2026-11-22')).toBe('2026-11-23')
  })
  it('addDays / diffDays / daysRange', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-11-16', -16)).toBe('2026-10-31')
    expect(diffDays('2026-11-16', '2026-11-22')).toBe(6)
    expect(diffDays('2026-11-22', '2026-11-16')).toBe(-6)
    expect(daysRange('2026-11-16', '2026-11-18')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18'])
    expect(daysRange('2026-11-18', '2026-11-16')).toEqual([])
  })
  it('isSameWeek', () => {
    expect(isSameWeek('2026-11-16', '2026-11-22')).toBe(true)
    expect(isSameWeek('2026-11-22', '2026-11-23')).toBe(false)
  })
  it('noms des jours en français', () => {
    expect(isoDayName(1)).toBe('lundi')
    expect(isoDayName(7)).toBe('dimanche')
    expect(formatDay('2026-11-16', 'EEEE d MMMM')).toBe('lundi 16 novembre')
  })
})

describe('heure de Paris et changements d’heure', () => {
  it('heure d’hiver : minuit à Paris = 23:00 UTC la veille', () => {
    expect(dayKeyAt(new Date('2026-11-15T22:59:59Z'))).toBe('2026-11-15')
    expect(dayKeyAt(new Date('2026-11-15T23:00:00Z'))).toBe('2026-11-16')
    expect(hourAt(new Date('2026-11-15T23:00:00Z'))).toBe(0)
    expect(hourAt(new Date('2026-11-16T20:30:00Z'))).toBe(21)
  })
  it('heure d’été : minuit à Paris = 22:00 UTC la veille', () => {
    expect(dayKeyAt(new Date('2026-07-14T21:59:59Z'))).toBe('2026-07-14')
    expect(dayKeyAt(new Date('2026-07-14T22:00:00Z'))).toBe('2026-07-15')
  })
  it('fin mars (29/03/2026, 2h → 3h) : autour de minuit', () => {
    // Samedi 28 → dimanche 29 : encore en heure d'hiver (UTC+1).
    expect(dayKeyAt(new Date('2026-03-28T22:59:00Z'))).toBe('2026-03-28')
    expect(dayKeyAt(new Date('2026-03-28T23:00:00Z'))).toBe('2026-03-29')
    // Le dimanche 29 dure 23 h : à 01:59 UTC il est 03:59 à Paris.
    expect(hourAt(new Date('2026-03-29T00:59:00Z'))).toBe(1)
    expect(hourAt(new Date('2026-03-29T01:00:00Z'))).toBe(3)
    // Dimanche 29 → lundi 30 : heure d'été (UTC+2), minuit = 22:00 UTC.
    expect(dayKeyAt(new Date('2026-03-29T21:59:59Z'))).toBe('2026-03-29')
    expect(dayKeyAt(new Date('2026-03-29T22:00:00Z'))).toBe('2026-03-30')
    expect(isoDayOf(dayKeyAt(new Date('2026-03-29T22:00:00Z')))).toBe(1)
  })
  it('fin octobre (25/10/2026, 3h → 2h) : autour de minuit', () => {
    // Samedi 24 → dimanche 25 : encore en heure d'été (UTC+2).
    expect(dayKeyAt(new Date('2026-10-24T21:59:59Z'))).toBe('2026-10-24')
    expect(dayKeyAt(new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25')
    // Le dimanche 25 dure 25 h : 2h du matin arrive deux fois.
    expect(hourAt(new Date('2026-10-25T00:30:00Z'))).toBe(2)
    expect(hourAt(new Date('2026-10-25T01:30:00Z'))).toBe(2)
    // Dimanche 25 → lundi 26 : heure d'hiver (UTC+1), minuit = 23:00 UTC.
    expect(dayKeyAt(new Date('2026-10-25T22:59:59Z'))).toBe('2026-10-25')
    expect(dayKeyAt(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26')
    expect(weekStartOf(dayKeyAt(new Date('2026-10-25T22:59:59Z')))).toBe('2026-10-19')
    expect(weekStartOf(dayKeyAt(new Date('2026-10-25T23:00:00Z')))).toBe('2026-10-26')
  })
  it('addDays ne glisse pas à travers les changements d’heure', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-03-23', 7)).toBe('2026-03-30')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDays('2026-10-19', 7)).toBe('2026-10-26')
    expect(addDays('2026-10-26', -7)).toBe('2026-10-19')
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31)
    expect(diffDays('2026-10-01', '2026-11-01')).toBe(31)
    expect(weekDays('2026-10-19').at(-1)).toBe('2026-10-25')
    expect(weekDays('2026-03-23').at(-1)).toBe('2026-03-29')
  })
})
