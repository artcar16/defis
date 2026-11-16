import { describe, expect, it } from 'vitest'
import { activityText, CHECKIN_WORD, makeActivity, type ActivityKind } from './activity'

const KINDS: ActivityKind[] = [
  'checkin_done',
  'checkin',
  'weighin',
  'proposal',
  'proposal_accepted',
  'proposal_refused',
  'stake',
  'gage_paid',
  'profile',
]

describe('activity · textes des toasts', () => {
  it('le check-in de l’autre, avec un trait d’union insécable', () => {
    expect(activityText('checkin_done', 'Laetitia')).toBe('👀 Laetitia vient de faire son check‑in')
    expect(CHECKIN_WORD).toBe('check‑in')
  })

  it('chaque type a un texte qui nomme l’autre, en typographie française', () => {
    for (const kind of KINDS) {
      const text = activityText(kind, 'Arthus')
      expect(text, kind).toContain('Arthus')
      // Jamais d'espace ordinaire avant : ; ! ? (typo()), jamais d'apostrophe droite.
      expect(text, kind).not.toMatch(/ [:;!?]/)
      expect(text, kind).not.toContain("'")
    }
    expect(activityText('proposal', 'Arthus')).toContain(' :')
  })

  it('gage payé : validé par défaut, ou annulé', () => {
    expect(activityText('gage_paid', 'Laetitia')).toMatch(/validé ton gage/)
    expect(activityText('gage_paid', 'Laetitia', { paid: false })).toMatch(/annulé/)
  })

  it('proposition acceptée : par l’autre, ou acceptée d’office (sans accord requis)', () => {
    expect(activityText('proposal_accepted', 'Laetitia', { autoAccepted: false })).toContain('a accepté ta proposition')
    expect(activityText('proposal_accepted', 'Laetitia', { autoAccepted: true })).toContain('a changé une règle')
  })

  it('prénom vide : « L’autre »', () => {
    expect(activityText('weighin', '  ')).toContain('L’autre')
  })

  it('makeActivity : kind + joueur + texte', () => {
    expect(makeActivity('stake', 'laetitia', 'Laetitia')).toEqual({
      kind: 'stake',
      playerId: 'laetitia',
      text: activityText('stake', 'Laetitia'),
    })
  })
})
