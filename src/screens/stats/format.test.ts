import { describe, expect, it } from 'vitest'
import { NBSP, typo } from '../../core/fr'
import { makePlayer } from '../../core/test-helpers'
import { axisPct, recordLine, scoreLine, verdictLabel } from './format'

const laetitia = makePlayer('laetitia', { name: 'Laetitia' })
const arthus = makePlayer('arthus', { name: 'Arthus' })

/** Toutes les phrases du bilan, pour les deux points de vue et chaque situation. */
function allRecordLines(): string[] {
  const out: string[] = []
  for (const [me, other] of [
    [laetitia, arthus],
    [arthus, laetitia],
  ]) {
    for (let played = 0; played <= 6; played++) {
      for (let mine = 0; mine <= played; mine++) {
        const theirs = played - mine
        out.push(recordLine(me, other, mine, theirs, played, 'lundi'))
        if (played >= 2) out.push(recordLine(me, other, 1, 1, played, 'lundi'))
      }
    }
  }
  return out
}

describe('Stats : formats', () => {
  it('axe des % à la française, espace insécable', () => {
    expect(axisPct(0)).toBe(`0${NBSP}%`)
    expect(axisPct(-0.04)).toBe(`0${NBSP}%`)
    expect(axisPct(-1)).toBe(`−1${NBSP}%`)
    expect(axisPct(-0.5)).toBe(`−0,5${NBSP}%`)
    expect(axisPct(2)).toBe(`+2${NBSP}%`)
  })

  it('premier verdict : lundi, lundi prochain ou la date', () => {
    // Mercredi 18/11 → verdict lundi 23/11.
    expect(verdictLabel('2026-11-18', '2026-11-23')).toBe('lundi')
    // Lundi 16/11 → verdict lundi 23/11 : « lundi » seul serait ambigu.
    expect(verdictLabel('2026-11-16', '2026-11-23')).toBe('lundi prochain')
    // Duel pas commencé : on donne la date (« 1er » pour le premier du mois).
    expect(verdictLabel('2026-11-16', '2026-11-30')).toBe('lundi 30 novembre')
    expect(verdictLabel('2027-01-27', '2027-02-01')).toBe('lundi')
    expect(verdictLabel('2027-01-20', '2027-02-01')).toBe('lundi 1er février')
  })

  it('score insécable', () => {
    expect(scoreLine(2, 1)).toBe(`2${NBSP}–${NBSP}1`)
  })
})

describe('Stats : phrases du bilan', () => {
  it('tutoiement cohérent, sans masculin imposé ni anglicisme', () => {
    expect(recordLine(arthus, laetitia, 2, 1, 3, 'lundi')).toBe(
      `Tu mènes 2${NBSP}–${NBSP}1. Pas le moment de t’endormir sur tes lauriers 😏`,
    )
    const lines = allRecordLines()
    expect(lines.some((l) => l.startsWith('En tête du bilan 👑'))).toBe(true)
    for (const l of lines) {
      expect(l).not.toMatch(/leader|ses lauriers|mené|gagnant|perdant/i)
    }
  })

  it('typographie française : apostrophe courbe, insécables, rien à corriger', () => {
    for (const l of allRecordLines()) {
      expect(l).not.toContain("'")
      expect(l).not.toMatch(/ [!?:;%»]/)
      expect(typo(l)).toBe(l)
    }
  })

  it('tableau vierge : annonce le premier verdict', () => {
    expect(recordLine(arthus, laetitia, 0, 0, 0, 'lundi 30 novembre')).toBe('Le tableau est encore vierge… premier verdict lundi 30 novembre 👀')
  })
})
