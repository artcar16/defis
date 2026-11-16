import { describe, expect, it } from 'vitest'
import { CODE_LENGTH } from '../../data/source'
import { CODE_MESSAGES, changeCodeStep, cleanCode, isCodeComplete, newCodeStep, pasteCode } from './code'

describe('cleanCode', () => {
  it('ne garde que les chiffres, CODE_LENGTH au plus', () => {
    expect(CODE_LENGTH).toBe(6)
    expect(cleanCode('12 34 56')).toBe('123456')
    expect(cleanCode('12-34-56-78')).toBe('123456')
    expect(cleanCode('a1b2c')).toBe('12')
    expect(cleanCode('')).toBe('')
  })

  it('ignore les chiffres qui ne sont pas 0-9 (le serveur veut [0-9])', () => {
    expect(cleanCode('١٢٣')).toBe('')
  })
})

describe('isCodeComplete', () => {
  it('exactement CODE_LENGTH chiffres', () => {
    expect(isCodeComplete('123456')).toBe(true)
    expect(isCodeComplete('12345')).toBe(false)
    expect(isCodeComplete('12345a')).toBe(false)
    expect(isCodeComplete('')).toBe(false)
  })
})

describe('pasteCode', () => {
  it('un code entier collé remplace ce qui est tapé', () => {
    expect(pasteCode('12', 'Mon code : 654 321')).toBe('654321')
    expect(pasteCode('123456', '9876543')).toBe('987654')
  })

  it('quelques chiffres collés s’ajoutent', () => {
    expect(pasteCode('12', '34')).toBe('1234')
    expect(pasteCode('1234', '5 6 7')).toBe('123456')
    expect(pasteCode('12', 'abc')).toBe('12')
  })
})

describe('newCodeStep (premier code : choisir puis confirmer)', () => {
  it('choisir → confirmer → envoyer', () => {
    const a = newCodeStep({ first: null }, '123456')
    expect(a).toEqual({ kind: 'next', state: { first: '123456' } })
    const b = newCodeStep(a.state, '123456')
    expect(b).toEqual({ kind: 'submit', state: { first: '123456' }, code: '123456' })
  })

  it('confirmation différente : erreur et on recommence le choix', () => {
    const r = newCodeStep({ first: '123456' }, '123457')
    expect(r).toEqual({ kind: 'error', state: { first: null }, error: CODE_MESSAGES.mismatch })
  })
})

describe('changeCodeStep (ancien, nouveau, confirmation)', () => {
  it('parcours complet', () => {
    const a = changeCodeStep({ step: 'old' }, '111111')
    expect(a).toEqual({ kind: 'next', state: { step: 'new', old: '111111' } })
    const b = changeCodeStep(a.state, '222222')
    expect(b).toEqual({ kind: 'next', state: { step: 'confirm', old: '111111', next: '222222' } })
    const c = changeCodeStep(b.state, '222222')
    expect(c).toEqual({ kind: 'submit', state: b.state, oldCode: '111111', newCode: '222222' })
  })

  it('nouveau = ancien : refusé, on reste sur « nouveau »', () => {
    const r = changeCodeStep({ step: 'new', old: '111111' }, '111111')
    expect(r).toEqual({ kind: 'error', state: { step: 'new', old: '111111' }, error: CODE_MESSAGES.sameAsOld })
  })

  it('confirmation différente : retour à « nouveau », l’ancien est gardé', () => {
    const r = changeCodeStep({ step: 'confirm', old: '111111', next: '222222' }, '333333')
    expect(r).toEqual({ kind: 'error', state: { step: 'new', old: '111111' }, error: CODE_MESSAGES.mismatch })
  })

  it('messages en typographie française', () => {
    expect(CODE_MESSAGES.mismatch).not.toMatch(/ [?!]/)
    expect(CODE_MESSAGES.sameAsOld).not.toContain("'")
  })
})
