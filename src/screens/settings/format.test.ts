import { describe, expect, it } from 'vitest'
import { RULES } from '../../config/rules'
import { NBSP } from '../../core/fr'
import type { Proposal, ProposalPayload } from '../../core/types'
import { KG_RANGE_ERROR, describeProposal, fromLabel, parseKg } from './format'

const ctx = { meId: 'arthus', habits: [], currentWeighDay: 7 }

function proposal(authorId: string, payload: ProposalPayload): Proposal {
  return { id: 'p1', authorId, payload, status: 'pending', createdAt: '', decidedAt: null, effectiveFrom: null }
}

describe('Réglages : textes', () => {
  it('date d’effet : « 1er » et jamais de double point', () => {
    expect(fromLabel('2026-11-23')).toBe(`dès lundi 23${NBSP}nov.`)
    expect(fromLabel('2027-02-01')).toBe(`dès lundi 1er${NBSP}févr.`)
  })

  it('bornes de saisie lues dans RULES', () => {
    expect(KG_RANGE_ERROR).toBe(`Saisis un poids entre ${RULES.weighIn.minKg} et ${RULES.weighIn.maxKg}${NBSP}kg 🙃`)
    expect(parseKg('72,46')).toBe(72.5)
    expect(parseKg(String(RULES.weighIn.maxKg + 1))).toBeNull()
  })
})

describe('describeProposal : objectif de poids', () => {
  it('le retrait se lit sur le drapeau clear', () => {
    const t = describeProposal(proposal('laetitia', { kind: 'goal_weight', clear: true, goalKg: null, goalFromStartPct: null }), ctx)
    expect(t.title).toBe('Retirer son objectif de poids')
  })

  it('un objectif masqué (kilos de l’autre à null) n’est pas pris pour un retrait', () => {
    const t = describeProposal(proposal('laetitia', { kind: 'goal_weight', clear: false, goalKg: null, goalFromStartPct: null }), ctx)
    expect(t.title).toBe('Nouvel objectif de poids')
  })

  it('jamais de kg pour l’objectif de l’autre, même s’ils sont dans le payload', () => {
    const t = describeProposal(proposal('laetitia', { kind: 'goal_weight', clear: false, goalKg: 61.5, goalFromStartPct: -6 }), ctx)
    expect(t.title).toBe(`Nouvel objectif${NBSP}: −6,0${NBSP}%`)
    expect(`${t.title} ${t.detail}`).not.toMatch(/kg/)
  })

  it('mon objectif à moi est en kg', () => {
    const t = describeProposal(proposal('arthus', { kind: 'goal_weight', clear: false, goalKg: 79.5, goalFromStartPct: -6.03 }), ctx)
    expect(t.title).toBe(`Mon objectif${NBSP}: 79,5${NBSP}kg`)
    expect(t.detail).toBe(`−6,0${NBSP}% depuis mon départ`)
    const clear = describeProposal(proposal('arthus', { kind: 'goal_weight', clear: true, goalKg: null, goalFromStartPct: null }), ctx)
    expect(clear.title).toBe('Retirer mon objectif de poids')
  })

  it('typographie : guillemets avec espaces insécables', () => {
    const habits = [
      { id: 'h1', playerId: 'laetitia', name: 'Ongles', hint: '', emoji: '💅', kind: 'avoid' as const, badgeKey: null, activeFrom: '2026-11-02', activeUntil: null, sortOrder: 0 },
    ]
    const t = describeProposal(proposal('laetitia', { kind: 'habit_kind', habitId: 'h1', habitKind: 'do' }), { ...ctx, habits })
    expect(t.title).toBe(`Passer 💅 Ongles en «${NBSP}à faire${NBSP}»`)
  })
})
