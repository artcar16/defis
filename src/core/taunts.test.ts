import { describe, expect, it } from 'vitest'
import { DEFAULT_GAGES } from '../config/defaults'
import {
  CHECKIN_PHRASES,
  RESULTS_PHRASES,
  RING_PHRASES,
  WEIGHIN_REACTIONS,
  type RingSituation,
} from '../content/phrases'
import { addDays } from './dates'
import { NBSP as FR_NBSP, formatPts as frFormatPts, plural, typo } from './fr'
import { weighInPoints } from './scoring'
import {
  activeRingSituations,
  checkinState,
  dayBucket,
  fillTemplate,
  formatPts,
  gapBucket,
  pickCheckinLine,
  pickRingTaunt,
  resultsLine,
  weighInBucket,
  weighInReaction,
  type CheckinLineContext,
  type RingTauntContext,
} from './taunts'
import { A, L, START, dayScore, emptyRecord, makePlayer } from './test-helpers'
import type { CheckinValue } from './types'

const NBSP = ' '
/** Mots interdits dans le Ring : jamais de kilos ni de physique. */
const BANNED = /kilo|kg|gros|poids|grosse|maigr|ventre|bide|graisse/i
const norm = (s: string) => s.replaceAll(NBSP, ' ')

/** Petit générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Le texte vient-il de l'une des phrases d'une situation ? (espaces insécables et élisions comprises) */
function fromSituation(text: string, situation: RingSituation): boolean {
  return RING_PHRASES[situation].some((p) => templateRegex(p.text).test(norm(text)))
}
function templateRegex(template: string): RegExp {
  const parts = template
    .split(/\{\w+\}/)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // « de {x} » peut devenir « d’Arthus » (élision automatique).
    .map((s) => s.replace(/(^|[^\p{L}])(d|qu)e $/u, '$1$2(?:e |’)'))
  return new RegExp(`^${parts.join('.+?')}$`, 'su')
}

const arthus = makePlayer(A)
const laetitia = makePlayer(L)

/** Un contexte « calme » : milieu d'après-midi, les deux check-ins faits, pas de pesée, pas de série. */
function calm(patch: Partial<RingTauntContext> = {}): RingTauntContext {
  return {
    me: arthus,
    other: laetitia,
    myTotal: 300,
    otherTotal: 300,
    isoDay: 3,
    hour: 15,
    daysLeft: 5,
    myToday: dayScore({ filled: 3, total: 3, complete: true, score: 80 }),
    otherToday: dayScore({ filled: 3, total: 3, complete: true, score: 70 }),
    myBestStreak: null,
    otherBestStreak: null,
    isWeighInDay: false,
    record: emptyRecord(),
    seed: '2026-11-18',
    ...patch,
  }
}

function randomRingCtx(r: () => number): RingTauntContext {
  const int = (min: number, max: number) => min + Math.floor(r() * (max - min + 1))
  const meIsA = r() < 0.5
  const me = meIsA ? arthus : laetitia
  const other = meIsA ? laetitia : arthus
  const myTotal = int(0, 800)
  const mode = r()
  const otherTotal = mode < 0.15 ? myTotal : mode < 0.45 ? Math.max(0, myTotal + int(-29, 29)) : mode < 0.7 ? Math.max(0, myTotal + int(-100, 100)) : int(0, 800)
  const isoDay = int(1, 7)
  const today = (complete: boolean) =>
    dayScore(complete ? { filled: 3, total: 3, complete: true, score: int(0, 100) } : { filled: int(0, 2), total: 3, complete: false, score: int(0, 60) })
  const streak = (playerId: string) =>
    r() < 0.5 ? null : { playerId, habitName: ['Ongles', 'Grignotage', 'Sport', 'Eau'][int(0, 3)], emoji: ['💅', '🍪', '🏃', '💧'][int(0, 3)], days: int(0, 40) }
  const played = int(0, 10)
  const myWins = int(0, played)
  const otherWins = int(0, played - myWins)
  const streakOwner = [me.id, other.id, null][int(0, 2)]
  return {
    me,
    other,
    myTotal,
    otherTotal,
    isoDay,
    hour: int(0, 23),
    daysLeft: 8 - isoDay,
    myToday: today(r() < 0.5),
    otherToday: today(r() < 0.5),
    myBestStreak: streak(me.id),
    otherBestStreak: streak(other.id),
    isWeighInDay: r() < 0.2,
    myWeighInDone: [true, false, undefined][int(0, 2)],
    notStarted: r() < 0.05 ? true : undefined,
    record: {
      wins: { [me.id]: myWins, [other.id]: otherWins },
      ties: played - myWins - otherWins,
      played,
      streak: streakOwner ? { playerId: streakOwner, count: int(1, 4) } : { playerId: null, count: 0 },
    },
    seed: addDays(START, int(0, 500)),
  }
}

describe('contenu (src/content/phrases.ts)', () => {
  it('assez de phrases pour ne pas tourner en rond', () => {
    expect(Object.values(RING_PHRASES).flat().length).toBeGreaterThanOrEqual(35)
    expect(CHECKIN_PHRASES.length).toBeGreaterThanOrEqual(15)
    expect(Object.values(WEIGHIN_REACTIONS).flat().length).toBeGreaterThanOrEqual(8)
    expect(RESULTS_PHRASES.length).toBeGreaterThanOrEqual(9)
    for (const kind of ['winner', 'loser', 'tie'] as const) {
      expect(RESULTS_PHRASES.filter((p) => p.kind === kind).length).toBeGreaterThanOrEqual(3)
    }
  })
  it('chaque situation du Ring a des phrases', () => {
    for (const [situation, list] of Object.entries(RING_PHRASES)) expect(list.length, situation).toBeGreaterThan(0)
  })
  it('jamais de kilos ni de physique dans le Ring et les réactions de pesée', () => {
    for (const p of Object.values(RING_PHRASES).flat()) expect(p.text).not.toMatch(BANNED)
    for (const p of Object.values(WEIGHIN_REACTIONS).flat()) expect(p.text).not.toMatch(BANNED)
  })
  it('contient les exemples du cahier des charges', () => {
    const all = [...Object.values(RING_PHRASES).flat().map((p) => p.text), ...CHECKIN_PHRASES.map((p) => p.text)]
    expect(all).toContain('{leader} mène de {gap}. {trailer}, lâche ce paquet de chips 🍟')
    expect(all).toContain('Journée parfaite ! Tes ongles te disent merci 💅')
    expect(all).toContain('Le frigo a gagné aujourd’hui 🍫… revanche demain.')
    expect(all).toContain('{other} n’a pas encore fait son check-in 👀')
  })
})

describe('outils', () => {
  it('fillTemplate remplit les trous, ou renvoie null s’il en manque un', () => {
    expect(fillTemplate('{a} et {b}', { a: 'x', b: 2 })).toBe('x et 2')
    expect(fillTemplate('{a} et {b}', { a: 'x' })).toBeNull()
    expect(fillTemplate('{a}', { a: '' })).toBeNull()
    expect(fillTemplate('{a}', { a: '{b}' })).toBe('{b}') // une valeur n'est jamais réinterprétée
  })
  it('tranches d’écart : égalité, < 30, 30 à 100, > 100', () => {
    expect([0, 1, 29, 30, 100, 101, -40].map(gapBucket)).toEqual(['tie', 'small', 'small', 'medium', 'medium', 'large', 'medium'])
  })
  it('moments de la manche', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(dayBucket)).toEqual(['monday', 'midweek', 'midweek', 'thursday', 'sprint', 'sprint', 'sunday'])
  })
})

describe('pickRingTaunt', () => {
  it('toujours une phrase complète, sans trou ni mot interdit (2000 contextes aléatoires)', () => {
    const r = rng(42)
    for (let i = 0; i < 2000; i++) {
      const ctx = randomRingCtx(r)
      const text = pickRingTaunt(ctx)
      expect(text.length).toBeGreaterThan(5)
      expect(text).not.toMatch(/\{\w*\}/)
      expect(text).not.toMatch(/undefined|null|NaN/)
      expect(text).not.toMatch(BANNED)
    }
  })

  it('déterministe : même contexte = même phrase (pas de clignotement)', () => {
    const r = rng(7)
    for (let i = 0; i < 300; i++) {
      const ctx = randomRingCtx(r)
      expect(pickRingTaunt(ctx)).toBe(pickRingTaunt(structuredClone(ctx)))
    }
  })

  it('ça change d’un jour à l’autre', () => {
    for (const lead of [{ myTotal: 340, otherTotal: 300 }, { myTotal: 300, otherTotal: 340 }, { myTotal: 300, otherTotal: 300 }]) {
      const lines = new Set(Array.from({ length: 30 }, (_, i) => pickRingTaunt(calm({ ...lead, seed: addDays('2026-11-18', i * 7) }))))
      expect(lines.size).toBeGreaterThanOrEqual(3)
    }
  })

  it('cohérent : celui qui « mène » est bien devant, avec le bon écart', () => {
    const r = rng(2024)
    let leading = 0
    let trailing = 0
    for (let i = 0; i < 2000; i++) {
      const ctx = randomRingCtx(r)
      const text = norm(pickRingTaunt(ctx))
      const gap = Math.abs(ctx.myTotal - ctx.otherTotal)
      const leader = ctx.myTotal > ctx.otherTotal ? ctx.me : ctx.myTotal < ctx.otherTotal ? ctx.other : null
      const m = text.match(/(\p{L}+) mène de (\d+) pts?/u)
      if (m) {
        expect(leader?.name, text).toBe(m[1])
        expect(Number(m[2]), text).toBe(gap)
      }
      if (/Tu mènes/.test(text)) {
        expect(ctx.myTotal, text).toBeGreaterThan(ctx.otherTotal)
        leading++
      }
      if (text.includes(`${ctx.other.name} mène de`) || text.includes('de retard')) {
        expect(ctx.otherTotal, text).toBeGreaterThan(ctx.myTotal)
        trailing++
      }
      if (/Égalité|égalité|Ex æquo/.test(text) && !/Égalité !|bilan/.test(text)) expect(ctx.myTotal, text).toBe(ctx.otherTotal)
    }
    // On couvre bien les deux camps.
    expect(leading).toBeGreaterThan(20)
    expect(trailing).toBeGreaterThan(20)
  })

  it('je mène / je suis mené·e / égalité, à chaque moment de la semaine', () => {
    for (const [myTotal, otherTotal] of [
      [320, 300],
      [380, 300],
      [520, 300],
      [300, 320],
      [300, 380],
      [300, 520],
      [300, 300],
    ]) {
      for (let isoDay = 1; isoDay <= 7; isoDay++) {
        const seen = new Set<string>()
        for (let s = 0; s < 10; s++) {
          const text = pickRingTaunt(calm({ myTotal, otherTotal, isoDay, daysLeft: 8 - isoDay, seed: addDays('2026-11-16', s) }))
          expect(text).not.toMatch(/\{\w*\}/)
          seen.add(text)
        }
        expect(seen.size, `${myTotal}-${otherTotal}, jour ${isoDay}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('exemple : « Laetitia mène de 40 pts. Arthus, lâche ce paquet de chips 🍟 »', () => {
    const found = Array.from({ length: 200 }, (_, i) =>
      norm(pickRingTaunt(calm({ myTotal: 300, otherTotal: 340, seed: addDays('2026-01-01', i) }))),
    )
    expect(found).toContain('Laetitia mène de 40 pts. Arthus, lâche ce paquet de chips 🍟')
  })

  it('le soir, si mon check-in n’est pas fait : rappel prioritaire', () => {
    for (let s = 0; s < 20; s++) {
      const ctx = calm({ hour: 21, myToday: dayScore({ filled: 1, total: 3 }), seed: addDays('2026-11-16', s) })
      expect(activeRingSituations(ctx)[0]).toBe('evening')
      expect(fromSituation(pickRingTaunt(ctx), 'evening')).toBe(true)
    }
    // Avant 19 h, pas de rappel.
    expect(activeRingSituations(calm({ hour: 18, myToday: dayScore({ filled: 1, total: 3 }) }))).not.toContain('evening')
  })

  it('exemple : « Arthus n’a pas encore fait son check-in 👀 » (vu par Laetitia)', () => {
    const lines = new Set(
      Array.from({ length: 40 }, (_, s) =>
        pickRingTaunt(calm({ me: laetitia, other: arthus, otherToday: dayScore({ filled: 0, total: 3 }), seed: addDays('2026-11-16', s) })),
      ),
    )
    expect([...lines].every((t) => fromSituation(t, 'otherPending'))).toBe(true)
    expect(lines).toContain('Arthus n’a pas encore fait son check-in 👀')
  })

  it('l’autre n’a rien fait mais moi non plus : pas de 👀 (c’est l’hôpital qui se moque de la charité)', () => {
    const ctx = calm({ myToday: dayScore({ filled: 0 }), otherToday: dayScore({ filled: 0 }) })
    expect(activeRingSituations(ctx)).not.toContain('otherPending')
  })

  it('jour de la pesée ⚖️ (tant que je ne me suis pas pesé·e)', () => {
    const ctx = calm({ isWeighInDay: true, isoDay: 7, daysLeft: 1 })
    expect(fromSituation(pickRingTaunt(ctx), 'weighin')).toBe(true)
    expect(pickRingTaunt(ctx)).toContain('⚖️')
    expect(activeRingSituations({ ...ctx, myWeighInDone: true })).not.toContain('weighin')
  })

  it('priorités : soir > pesée > l’autre pas fait', () => {
    const ctx = calm({ hour: 20, isWeighInDay: true, myToday: dayScore({ filled: 0 }), otherToday: dayScore({ filled: 0 }) })
    expect(activeRingSituations(ctx).slice(0, 2)).toEqual(['evening', 'weighin'])
    const done = calm({ isWeighInDay: true, otherToday: dayScore({ filled: 0 }) })
    expect(activeRingSituations(done).slice(0, 2)).toEqual(['weighin', 'otherPending'])
  })

  it('duel pas encore commencé', () => {
    expect(fromSituation(pickRingTaunt(calm({ notStarted: true, myTotal: 0, otherTotal: 0 })), 'notStarted')).toBe(true)
  })

  it('séries 🔥 : la mienne et celle de l’autre', () => {
    const mine = { playerId: A, habitName: 'Ongles', emoji: '💅', days: 12 }
    const theirs = { playerId: L, habitName: 'Grattage', emoji: '🦟', days: 9 }
    const texts = Array.from({ length: 60 }, (_, s) =>
      pickRingTaunt(calm({ myBestStreak: mine, otherBestStreak: theirs, seed: addDays('2026-11-16', s) })),
    )
    expect(texts.some((t) => norm(t).includes('12 jours') && t.includes('💅 Ongles'))).toBe(true)
    expect(texts.some((t) => t.includes('Laetitia') && norm(t).includes('9 jours') && t.includes('🦟 Grattage'))).toBe(true)
    // Une série de 2 jours ne compte pas encore.
    expect(activeRingSituations(calm({ myBestStreak: { ...mine, days: 2 } }))).not.toContain('myStreak')
  })

  it('revanche après avoir perdu la manche précédente (en début de semaine)', () => {
    const record = emptyRecord({ wins: { [A]: 1, [L]: 2 }, played: 3, streak: { playerId: L, count: 1 } })
    expect(activeRingSituations(calm({ record, isoDay: 1 }))).toContain('revenge')
    expect(activeRingSituations(calm({ record, isoDay: 5 }))).not.toContain('revenge')
    const texts = Array.from({ length: 60 }, (_, s) => pickRingTaunt(calm({ record, isoDay: 2, seed: addDays('2026-11-16', s) })))
    expect(texts.some((t) => fromSituation(t, 'revenge'))).toBe(true)
    expect(texts.some((t) => fromSituation(t, 'record') && t.includes('2 – 1'))).toBe(true)
    // Vu par Laetitia, c'est elle qui défend son titre.
    expect(activeRingSituations(calm({ me: laetitia, other: arthus, record, isoDay: 1 }))).toContain('defend')
  })
})

describe('pickCheckinLine', () => {
  const answers = (values: Partial<Record<'ongles' | 'grignotage' | 'sport', CheckinValue | null>>) => [
    { habitName: 'Ongles', emoji: '💅', badgeKey: 'ongles', value: values.ongles ?? null },
    { habitName: 'Grignotage', emoji: '🍪', badgeKey: 'grignotage', value: values.grignotage ?? null },
    { habitName: 'Sport', emoji: '🏃', badgeKey: 'sport', value: values.sport ?? null },
  ]
  const ctx = (values: Parameters<typeof answers>[0], seed = '2026-11-16'): CheckinLineContext => {
    const a = answers(values)
    const filled = a.filter((x) => x.value).length
    const points = a.reduce((s, x) => s + (x.value === 'nickel' || x.value === 'fait' ? 10 : x.value === 'unpeu' ? 5 : 0), 0)
    return {
      player: arthus,
      day: dayScore({ filled, total: 3, complete: filled === 3, points, score: Math.round((points / 30) * 100), perfect: points === 30 }),
      answers: a,
      seed,
    }
  }
  const linesFor = (values: Parameters<typeof answers>[0]) =>
    new Set(Array.from({ length: 60 }, (_, i) => pickCheckinLine(ctx(values, addDays('2026-11-16', i)))))

  it('états de la journée', () => {
    expect(checkinState(ctx({}))).toBe('empty')
    expect(checkinState(ctx({ ongles: 'nickel' }))).toBe('partial')
    expect(checkinState(ctx({ grignotage: 'craquage' }))).toBe('craquage')
    expect(checkinState(ctx({ ongles: 'nickel', grignotage: 'nickel', sport: 'fait' }))).toBe('perfect')
    expect(checkinState(ctx({ ongles: 'nickel', grignotage: 'craquage', sport: 'pasfait' }))).toBe('craquage')
    expect(checkinState(ctx({ ongles: 'unpeu', grignotage: 'nickel', sport: 'pasfait' }))).toBe('pasfait')
    expect(checkinState(ctx({ ongles: 'unpeu', grignotage: 'nickel', sport: 'fait' }))).toBe('unpeu')
  })

  it('journée parfaite : « Journée parfaite ! Tes ongles te disent merci 💅 »', () => {
    const lines = linesFor({ ongles: 'nickel', grignotage: 'nickel', sport: 'fait' })
    expect(lines).toContain(typo('Journée parfaite ! Tes ongles te disent merci 💅'))
    expect(lines.size).toBeGreaterThanOrEqual(3)
  })

  it('craquage grignotage : « Le frigo a gagné aujourd’hui 🍫… revanche demain. »', () => {
    expect(linesFor({ ongles: 'nickel', grignotage: 'craquage', sport: 'fait' })).toContain('Le frigo a gagné aujourd’hui 🍫… revanche demain.')
  })

  it('les phrases ciblées ne parlent que des habitudes concernées', () => {
    for (const line of linesFor({ ongles: 'craquage', grignotage: 'nickel', sport: 'fait' })) {
      expect(line).not.toMatch(/frigo|placards|canapé/)
    }
    // Laetitia n'a pas d'habitude « ongles » : jamais de 💅 dans sa journée parfaite.
    const l: CheckinLineContext = {
      player: laetitia,
      day: dayScore({ filled: 2, total: 2, complete: true, perfect: true, score: 100 }),
      answers: [
        { habitName: 'Grattage', emoji: '🦟', badgeKey: 'grattage', value: 'nickel' },
        { habitName: 'Eau', emoji: '💧', badgeKey: null, value: 'fait' },
      ],
      seed: '2026-11-16',
    }
    for (let i = 0; i < 30; i++) expect(pickCheckinLine({ ...l, seed: addDays('2026-11-16', i) })).not.toContain('ongles')
  })

  it('habitude perso ratée : on cite son emoji et son nom', () => {
    const c: CheckinLineContext = {
      player: laetitia,
      day: dayScore({ filled: 1, total: 1, complete: true, score: 0 }),
      answers: [{ habitName: 'Alcool', emoji: '🍷', badgeKey: null, value: 'craquage' }],
      seed: '2026-11-16',
    }
    const lines = new Set(Array.from({ length: 30 }, (_, i) => pickCheckinLine({ ...c, seed: addDays('2026-11-16', i) })))
    expect([...lines].some((t) => t.includes('🍷 Alcool'))).toBe(true)
  })

  it('jamais vide, jamais de trou, déterministe', () => {
    const values: (CheckinValue | null)[] = [null, 'nickel', 'unpeu', 'craquage']
    const sport: (CheckinValue | null)[] = [null, 'fait', 'pasfait']
    for (const o of values) {
      for (const g of values) {
        for (const s of sport) {
          for (let i = 0; i < 5; i++) {
            const c = ctx({ ongles: o, grignotage: g, sport: s }, addDays('2026-11-16', i))
            const text = pickCheckinLine(c)
            expect(text.length).toBeGreaterThan(5)
            expect(text).not.toMatch(/\{\w*\}|undefined|null|NaN/)
            expect(pickCheckinLine(structuredClone(c))).toBe(text)
          }
        }
      }
    }
  })

  it('en cours : le nombre d’habitudes restantes', () => {
    const lines = linesFor({ ongles: 'nickel' })
    expect([...lines].some((t) => t.includes('2'))).toBe(true)
  })
})

describe('weighInReaction', () => {
  it('tranches de points', () => {
    expect(weighInBucket(null, 0)).toBe('start')
    expect(weighInBucket(null, 0, true)).toBe('start')
    expect(weighInBucket(-1.5, 100)).toBe('max')
    expect(weighInBucket(-1, 100)).toBe('max')
    expect(weighInBucket(-1.5, 100, true)).toBe('max')
    expect(weighInBucket(0.3, 100, true)).toBe('goal')
    expect(weighInBucket(-0.8, 80)).toBe('great')
    expect(weighInBucket(-0.4, 40)).toBe('good')
    expect(weighInBucket(-0.1, 10)).toBe('small')
    expect(weighInBucket(0, 0)).toBe('zero')
    expect(weighInBucket(0.6, 0)).toBe('zero')
  })
  it('emoji + texte, avec les points, jamais de trou ni de mot interdit', () => {
    for (const change of [null, -3, -1, -0.8, -0.5, -0.2, -0.01, 0, 0.4, 2]) {
      for (const goal of [null, 0.5, 3]) {
        const points = weighInPoints({ changePct: change, goalDistancePct: goal })
        for (const seed of [undefined, '2026-11-22', '2026-11-29', '2026-12-06']) {
          const r = weighInReaction(change, points, seed)
          expect(r.emoji.length).toBeGreaterThan(0)
          expect(r.text).not.toMatch(/\{\w*\}|undefined|NaN/)
          expect(r.text).not.toMatch(BANNED)
          if (points > 0 && points < 100) expect(r.text).toContain(String(points))
        }
      }
    }
  })
  it('sans graine : toujours la même réaction (compatibilité)', () => {
    expect(weighInReaction(null, 0)).toEqual({ ...WEIGHIN_REACTIONS.start[0], text: typo(WEIGHIN_REACTIONS.start[0].text) })
    expect(weighInReaction(-0.5, 50)).toEqual({ emoji: WEIGHIN_REACTIONS.good[0].emoji, text: `50${NBSP}pts, c’est toujours ça de pris${NBSP}!` })
    expect(norm(weighInReaction(-0.01, 1).text)).toMatch(/^1 pt[ ,.]/)
  })
})

describe('resultsLine', () => {
  it('gagnant, perdant, égalité', () => {
    for (let i = 0; i < 20; i++) {
      const seed = addDays('2026-11-16', i * 7)
      expect(resultsLine('winner', laetitia, arthus, seed)).toContain('Laetitia')
      expect(resultsLine('loser', laetitia, arthus, seed)).toContain('Arthus')
      const tie = resultsLine('tie', null, null, seed)
      expect(tie).not.toMatch(/\{\w*\}/)
      expect(tie.length).toBeGreaterThan(5)
    }
  })
  it('varie selon la manche, et déterministe', () => {
    const lines = new Set(Array.from({ length: 20 }, (_, i) => resultsLine('winner', laetitia, arthus, addDays('2026-11-16', i * 7))))
    expect(lines.size).toBeGreaterThanOrEqual(2)
    expect(resultsLine('loser', laetitia, arthus, '2026-11-16')).toBe(resultsLine('loser', laetitia, arthus, '2026-11-16'))
  })
  it('écart et gage facultatifs', () => {
    const texts = Array.from({ length: 40 }, (_, i) =>
      norm(resultsLine('winner', arthus, laetitia, addDays('2026-11-16', i * 7), { gap: 150, stake: 'Massage de 15 min 💆' })),
    )
    expect(texts.some((t) => t.includes('150 pts'))).toBe(true)
    expect(texts.every((t) => !t.includes('sur le fil'))).toBe(true)
    const losers = Array.from({ length: 40 }, (_, i) =>
      resultsLine('loser', arthus, laetitia, addDays('2026-11-16', i * 7), { stake: 'Massage de 15 min 💆' }),
    )
    // Le gage s'insère dans la phrase avec une minuscule.
    expect(losers.some((t) => t.includes('massage de 15 min 💆'))).toBe(true)
  })
  it('sans prénom ni gage, pas de trou', () => {
    for (const kind of ['winner', 'loser', 'tie'] as const) {
      for (let i = 0; i < 20; i++) expect(resultsLine(kind, null, null, addDays('2026-11-16', i))).not.toMatch(/\{\w*\}/)
    }
  })
})

// ─── Français : élisions, typographie, accords ──────────────────────────────

/** « de Arthus », « que Écrans… » : élision oubliée. */
const MISSING_ELISION = /(?<![\p{L}])(?:de|que|De|Que) (?=[AEIOUaeiouÀÂÉÈÊËÎÏÔÖÙÛÜàâéèêëîïôöùûüŒœ])/u
/** Espace ordinaire là où il faut une insécable. */
const BAD_SPACE = / [!?;:»%]|« /
const ENGLISH = /\b(?:tap|go|vs|leader|round|ok|cool)\b/i
const HABITS = [
  { habitName: 'Ongles', emoji: '💅' },
  { habitName: 'Eau', emoji: '💧' },
  { habitName: 'Légumes', emoji: '🥦' },
  { habitName: 'Écrans au lit', emoji: '📱' },
]

function expectClean(text: string | null, where: string) {
  expect(text, where).not.toBeNull()
  const t = text!
  expect(t, where).not.toMatch(/[{}]|undefined|null|NaN/)
  expect(t, where).not.toMatch(MISSING_ELISION)
  expect(t, where).not.toMatch(BAD_SPACE)
  expect(t, where).not.toMatch(/'/)
  expect(t, where).not.toMatch(ENGLISH)
  expect(typo(t), where).toBe(t)
}

describe('français', () => {
  it('formatPts : une seule implémentation (core/fr.ts)', () => {
    expect(formatPts).toBe(frFormatPts)
    expect([0, 1, 2].map(formatPts)).toEqual([`0${NBSP}pt`, `1${NBSP}pt`, `2${NBSP}pts`])
  })

  it('fillTemplate élide « de » et « que » devant une voyelle', () => {
    expect(fillTemplate('Victoire de {w} !', { w: 'Arthus' })).toBe(`Victoire d’Arthus${NBSP}!`)
    expect(fillTemplate('Victoire de {w} !', { w: 'Laetitia' })).toBe(`Victoire de Laetitia${NBSP}!`)
    expect(fillTemplate('Que {w} gagne, mieux que {w}', { w: 'Arthus' })).toBe('Qu’Arthus gagne, mieux qu’Arthus')
    expect(fillTemplate('De {h} en {h}', { h: 'Écrans au lit' })).toBe('D’Écrans au lit en Écrans au lit')
    // Pas d'élision devant un nombre, ni au milieu d'un mot (« aide »).
    expect(fillTemplate('Plus que {n}, de {n}', { n: '8 pts' })).toBe('Plus que 8 pts, de 8 pts')
    expect(fillTemplate('À l’aide {w}', { w: 'Arthus' })).toBe('À l’aide Arthus')
    // Un trou manquant reste un trou manquant.
    expect(fillTemplate('de {w}', {})).toBeNull()
  })

  it('fillTemplate applique la typographie française', () => {
    expect(fillTemplate('Bilan : {a} ! « {b} » ?', { a: 1, b: 'x' })).toBe(`Bilan${NBSP}: 1${NBSP}! «${NBSP}x${NBSP}»${NBSP}?`)
  })

  it('toutes les phrases, remplies pour les deux joueurs et avec des habitudes perso : sans faute', () => {
    for (const [me, other] of [[arthus, laetitia], [laetitia, arthus]]) {
      for (const [leader, trailer] of [[me, other], [other, me]]) {
        for (const h of HABITS) {
          const vars = {
            me: me.name, other: other.name, leader: leader.name, trailer: trailer.name,
            gap: formatPts(1), myTotal: 300, otherTotal: 300, daysLeft: plural(1, 'jour'), hour: `21${FR_NBSP}h`,
            maxPoints: formatPts(100), habit: h.habitName, emoji: h.emoji, days: plural(12, 'jour'),
            myWins: 2, otherWins: 1, winStreak: 2,
          }
          for (const [situation, list] of Object.entries(RING_PHRASES)) {
            for (const p of list) expectClean(fillTemplate(p.text, vars), `${situation} : ${p.text}`)
          }
          for (const p of CHECKIN_PHRASES) {
            expectClean(fillTemplate(p.text, { name: me.name, score: 80, max: 100, left: plural(1, 'habitude'), habit: h.habitName, emoji: h.emoji }), p.text)
          }
        }
        for (const g of DEFAULT_GAGES) {
          for (const p of RESULTS_PHRASES) {
            expectClean(fillTemplate(p.text, { winner: leader.name, loser: trailer.name, gap: formatPts(12), stake: g.charAt(0).toLowerCase() + g.slice(1) }), p.text)
          }
        }
      }
    }
    for (const [bucket, list] of Object.entries(WEIGHIN_REACTIONS)) {
      for (const r of list) for (const n of [0, 1, 50]) expectClean(fillTemplate(r.text, { points: formatPts(n) }), `${bucket} : ${r.text}`)
    }
  })

  it('rien ne s’accorde avec {habit} (habitudes perso : « Eau », « Légumes »…)', () => {
    const all = [...Object.values(RING_PHRASES).flat(), ...CHECKIN_PHRASES]
    // Après {habit} : fin de phrase, ponctuation ou emoji, jamais un verbe ou un participe.
    for (const p of all) expect(p.text, p.text).not.toMatch(/\{habit\} \p{L}/u)
  })

  it('Ring : « Il est 21 h », « remontada d’Arthus »', () => {
    const evening = Array.from({ length: 40 }, (_, i) =>
      pickRingTaunt(calm({ hour: 21, myToday: dayScore({ filled: 1, total: 3 }), seed: addDays('2026-11-16', i) })),
    )
    expect(evening.some((t) => t.includes(`Il est 21${NBSP}h`))).toBe(true)
    const thursday = Array.from({ length: 60 }, (_, i) =>
      pickRingTaunt(calm({ me: laetitia, other: arthus, isoDay: 4, daysLeft: 4, myTotal: 340, otherTotal: 300, seed: addDays('2026-11-19', i * 7) })),
    )
    expect(thursday.some((t) => t.includes('remontada d’Arthus'))).toBe(true)
    expect(thursday.every((t) => !/de Arthus/.test(t))).toBe(true)
  })
})

describe('pickCheckinLine : rattrapage d’hier (isToday: false)', () => {
  type Answer = CheckinLineContext['answers'][number]
  const sets: { kind: 'avoid' | 'do'; answer: Omit<Answer, 'value'> }[][] = [
    [
      { kind: 'avoid', answer: { habitName: 'Ongles', emoji: '💅', badgeKey: 'ongles' } },
      { kind: 'avoid', answer: { habitName: 'Grignotage', emoji: '🍪', badgeKey: 'grignotage' } },
      { kind: 'do', answer: { habitName: 'Sport', emoji: '🏃', badgeKey: 'sport' } },
    ],
    [
      { kind: 'do', answer: { habitName: 'Eau', emoji: '💧', badgeKey: null } },
      { kind: 'do', answer: { habitName: 'Légumes', emoji: '🥦', badgeKey: null } },
      { kind: 'avoid', answer: { habitName: 'Écrans au lit', emoji: '📱', badgeKey: null } },
    ],
  ]
  const VALUES = { avoid: [null, 'nickel', 'unpeu', 'craquage'], do: [null, 'fait', 'pasfait'] } as const
  const pts = (v: CheckinValue | null) => (v === 'nickel' || v === 'fait' ? 10 : v === 'unpeu' ? 5 : 0)

  /** Toutes les combinaisons de réponses, pour les deux joueurs. */
  function* contexts(isToday: boolean | undefined): Generator<CheckinLineContext> {
    for (const set of sets) {
      const [a, b, c] = set
      for (const va of VALUES[a.kind]) for (const vb of VALUES[b.kind]) for (const vc of VALUES[c.kind]) {
        const answers: Answer[] = [{ ...a.answer, value: va }, { ...b.answer, value: vb }, { ...c.answer, value: vc }]
        const filled = answers.filter((x) => x.value).length
        const points = answers.reduce((sum, x) => sum + pts(x.value), 0)
        for (const player of [arthus, laetitia]) {
          for (let i = 0; i < 4; i++) {
            yield {
              player,
              answers,
              isToday,
              seed: addDays('2026-11-16', i),
              day: dayScore({ filled, total: 3, complete: filled === 3, points, score: Math.round((points / 30) * 100), perfect: points === 30 }),
            }
          }
        }
      }
    }
  }

  it('au passé : jamais « demain » ni « aujourd’hui »', () => {
    let hier = 0
    for (const ctx of contexts(false)) {
      const text = pickCheckinLine(ctx)
      expect(text).not.toMatch(/demain|aujourd[’']hui/i)
      expectClean(text, text)
      if (/hier/i.test(text)) hier++
    }
    expect(hier).toBeGreaterThan(50) // les variantes au passé sortent bien
  })

  it('le jour même (par défaut) : « demain » est permis, jamais « hier »', () => {
    let demain = 0
    for (const ctx of contexts(undefined)) {
      const text = pickCheckinLine(ctx)
      expect(text).not.toMatch(/\bhier\b/i)
      expectClean(text, text)
      if (/demain/i.test(text)) demain++
    }
    expect(demain).toBeGreaterThan(50)
  })

  it('restant : « Plus que 1 habitude », « Encore 2 habitudes »', () => {
    const lines = new Set<string>()
    for (const ctx of contexts(true)) if (ctx.day.filled === 1 || ctx.day.filled === 2) lines.add(norm(pickCheckinLine(ctx)))
    expect([...lines].some((t) => /(Plus que|Encore) 1 habitude\b/.test(t))).toBe(true)
    expect([...lines].some((t) => /(Plus que|Encore) 2 habitudes\b/.test(t))).toBe(true)
  })
})

describe('weighInReaction : zone objectif', () => {
  const goalEmojis = WEIGHIN_REACTIONS.goal.map((r) => r.emoji)
  it('−0,995 % → 100 pts par la variation seule : « max », pas « zone objectif »', () => {
    expect(weighInBucket(-0.995, 100)).toBe('max')
    expect(weighInBucket(-0.995, 100, true)).toBe('goal')
    for (let i = 0; i < 20; i++) {
      const r = weighInReaction(-0.995, 100, addDays('2026-11-22', i * 7))
      expect(goalEmojis).not.toContain(r.emoji)
      expect(r.text).not.toMatch(/objectif/i)
    }
  })
  it('dans la zone objectif, sans avoir perdu 1 % : réaction 🎯', () => {
    for (let i = 0; i < 10; i++) expect(goalEmojis).toContain(weighInReaction(0.3, 100, addDays('2026-11-22', i * 7), true).emoji)
  })
})

describe('resultsLine : gage et perdant', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => addDays('2026-11-16', i * 7))
  it('le gage s’insère en minuscule, l’emoji 😈 en tête', () => {
    const lines = seeds.map((s) => resultsLine('loser', laetitia, arthus, s, { gap: 150, stake: 'Vaisselle pendant une semaine 🍽️' }))
    expect(lines).toContain(typo('😈 Arthus, au programme : vaisselle pendant une semaine 🍽️'))
  })
  it('un gage qui commence par un prénom garde sa majuscule', () => {
    const lines = seeds.map((s) => resultsLine('loser', laetitia, arthus, s, { stake: 'Laetitia choisit le resto 🍝' }))
    expect(lines.some((t) => t.includes('au programme') && t.includes('Laetitia choisit le resto'))).toBe(true)
  })
  it('perdant : pas de « dès lundi » (la cérémonie s’ouvre après la manche), « à un biscuit près »', () => {
    const lines = seeds.map((s) => norm(resultsLine('loser', laetitia, arthus, s, { gap: 3, stake: 'Massage' })))
    expect(lines.every((t) => !/dès lundi/.test(t))).toBe(true)
    expect(lines).toContain('Perdu de 3 pts, Arthus… Ça s’est joué à un biscuit près 🍪')
  })
  it('élision : « Victoire d’Arthus »', () => {
    const lines = seeds.map((s) => resultsLine('winner', arthus, laetitia, s, { gap: 150 }))
    expect(lines.some((t) => t.includes('Victoire d’Arthus') || t.includes('Victoire écrasante d’Arthus'))).toBe(true)
    expect(lines.every((t) => !/de Arthus/.test(t))).toBe(true)
  })
  it('égalité : le gage pour les deux', () => {
    const lines = seeds.map((s) => resultsLine('tie', arthus, laetitia, s, { stake: 'Corvée de courses 🛒' }))
    expect(lines).toContain(typo('Égalité parfaite 🤝 Au programme pour les deux : corvée de courses 🛒'))
  })
})
