import { afterEach, describe, expect, it, vi } from 'vitest'
import { RULES } from '../../config/rules'
import { dailyScore, indexCheckins, canEditCheckin } from '../../core/scoring'
import { buildSeason, pendingResultsWeek } from '../../core/season'
import { drawStake } from '../../core/stake'
import type { DuelSnapshot, ProposalPayload } from '../../core/types'
import type { Activity } from '../source'
import { DemoSource } from './DemoSource'
import type { DemoState } from './generate'

/** Horloge fixe : le lundi 16 novembre 2026, midi à Paris. */
const clock = () => new Date('2026-11-16T11:00:00Z')

function make(search = '?reset=1&as=arthus') {
  return new DemoSource({ search, clock, persist: false })
}

function checkinsOf(snap: DuelSnapshot, playerId: string, day: string) {
  return snap.checkins.filter((c) => c.playerId === playerId && c.day === day)
}

function goalProposal(snap: DuelSnapshot) {
  const p = snap.proposals.find((x) => x.payload.kind === 'goal_weight' && x.status !== 'cancelled')
  return p?.payload.kind === 'goal_weight' ? { ...p, payload: p.payload } : null
}

const GOAL: ProposalPayload = { kind: 'goal_weight', clear: false, goalKg: 60.2, goalFromStartPct: -9.06 }

afterEach(() => {
  vi.useRealTimers()
})

describe('DemoSource · kilos de l’autre', () => {
  it('masque l’objectif en kg des propositions de l’autre (et seulement de l’autre)', async () => {
    const src = make('?reset=1&as=laetitia')
    await src.propose(GOAL)
    expect(goalProposal(src.getSnapshot())?.payload.goalKg).toBe(60.2)

    src.switchPlayer('arthus')
    const seenByArthus = goalProposal(src.getSnapshot())!
    expect(seenByArthus.payload.goalKg).toBeNull()
    expect(seenByArthus.payload.goalFromStartPct).toBe(-9.06)
    expect(seenByArthus.payload.clear).toBe(false)

    // Le snapshot est une copie : le modifier ne touche pas l'état (vu au snapshot suivant).
    seenByArthus.payload.goalFromStartPct = 0
    await src.updateProfile({})
    expect(goalProposal(src.getSnapshot())?.payload.goalFromStartPct).toBe(-9.06)

    // Si Laetitia montre ses kilos, Arthus les voit.
    src.switchPlayer('laetitia')
    await src.updateProfile({ showKg: true })
    src.switchPlayer('arthus')
    expect(goalProposal(src.getSnapshot())?.payload.goalKg).toBe(60.2)
  })

  it('accepter un objectif utilise les vrais kilos de l’état, retirer l’objectif le retire dès lundi', async () => {
    const src = make('?reset=1&as=laetitia')
    await src.propose(GOAL)
    src.switchPlayer('arthus')
    const id = goalProposal(src.getSnapshot())!.id
    await src.answerProposal(id, true)
    src.switchPlayer('laetitia')
    src.setToday('2026-11-23')
    expect(src.getSnapshot().players.find((p) => p.id === 'laetitia')?.goalKg).toBe(60.2)

    await src.propose({ kind: 'goal_weight', clear: true, goalKg: null, goalFromStartPct: null })
    src.switchPlayer('arthus')
    const clearId = src.getSnapshot().proposals.find((p) => p.status === 'pending' && p.payload.kind === 'goal_weight')!.id
    await src.answerProposal(clearId, true)
    src.switchPlayer('laetitia')
    src.setToday('2026-11-30')
    expect(src.getSnapshot().players.find((p) => p.id === 'laetitia')?.goalKg).toBeNull()
  })
})

describe('DemoSource · voyage dans le temps', () => {
  it('en avant, garde mes check-ins et n’invente que les jours manquants (hier incomplet pour moi)', async () => {
    const src = make('?reset=1&as=arthus')
    const habits = src.getSnapshot().habits.filter((h) => h.playerId === 'arthus')
    for (const h of habits) await src.setCheckin('2026-11-16', h.id, h.kind === 'avoid' ? 'craquage' : 'pasfait')
    const before = checkinsOf(src.getSnapshot(), 'arthus', '2026-11-16').map((c) => `${c.habitId}=${c.value}`).sort()

    src.setToday('2026-11-18')
    const snap = src.getSnapshot()
    expect(checkinsOf(snap, 'arthus', '2026-11-16').map((c) => `${c.habitId}=${c.value}`).sort()).toEqual(before)
    // L'autre : l'ancien « aujourd'hui » et la veille remplis, le nouveau jour vide.
    const index = indexCheckins(snap.checkins)
    expect(dailyScore('laetitia', '2026-11-16', snap.habits, index).complete).toBe(true)
    expect(dailyScore('laetitia', '2026-11-17', snap.habits, index).complete).toBe(true)
    expect(checkinsOf(snap, 'laetitia', '2026-11-18')).toHaveLength(0)
    // Moi : la veille est incomplète → « Hier n'est pas complet » sur le Ring.
    const yesterday = dailyScore('arthus', '2026-11-17', snap.habits, index)
    expect(yesterday.filled).toBe(yesterday.total - 1)
    expect(canEditCheckin('2026-11-17', '2026-11-18', snap.settings)).toBe(true)
  })

  it('le lundi suivant : cérémonie de la manche 4, enjeu tiré, propositions acceptées en vigueur', async () => {
    const src = make('?reset=1&as=arthus&seen=1')
    await src.answerProposal('demo-proposal-eau', true)
    src.setToday('2026-11-23')
    const snap = src.getSnapshot()
    const season = buildSeason(snap, '2026-11-23')
    expect(season.finished).toHaveLength(4)
    expect(pendingResultsWeek(season, snap.seenResults)?.weekStart).toBe('2026-11-16')
    // La pesée du dimanche a eu lieu pour les deux.
    expect(snap.weighIns.filter((w) => w.day === '2026-11-22').map((w) => w.playerId).sort()).toEqual(['arthus', 'laetitia'])
    // Enjeu de la nouvelle manche tiré automatiquement (décision 4).
    const prevStake = snap.weeks.find((w) => w.weekStart === '2026-11-16')?.stake ?? null
    expect(snap.weeks.find((w) => w.weekStart === '2026-11-23')?.stake).toBe(drawStake(snap.settings.gages, '2026-11-23', prevStake))
    // 💧 Eau, acceptée lundi 16, compte pour Laetitia dès lundi 23.
    const eau = snap.habits.find((h) => h.playerId === 'laetitia' && h.name === 'Eau')
    expect(eau?.activeFrom).toBe('2026-11-23')
    expect(snap.proposals.find((p) => p.id === 'demo-proposal-eau')?.status).toBe('accepted')
  })

  it('en arrière, efface tout ce qui est après le nouveau jour', async () => {
    const src = make('?reset=1&as=arthus')
    src.setToday('2026-11-23')
    await src.markResultsSeen('2026-11-16')
    await src.recordBadgeUnlocks([{ playerId: 'arthus', badgeId: 'machine', tier: null, day: '2026-11-21' }])
    src.setToday('2026-11-19')
    const snap = src.getSnapshot()
    expect(snap.checkins.every((c) => c.day <= '2026-11-19')).toBe(true)
    expect(snap.weighIns.every((w) => w.day <= '2026-11-19')).toBe(true)
    expect(snap.weeks.some((w) => w.weekStart === '2026-11-23')).toBe(false)
    expect(snap.seenResults).not.toContain('2026-11-16')
    expect(snap.badgeUnlocks).toHaveLength(0)
    // Les manches finies restent vues.
    expect(snap.seenResults).toContain('2026-10-26')
  })
})

describe('DemoSource · propositions', () => {
  it('une nouvelle proposition sur le même sujet remplace celle en attente', async () => {
    const src = make('?reset=1&as=arthus')
    await src.propose({ kind: 'weigh_day', isoDay: 6 })
    await src.propose({ kind: 'weigh_day', isoDay: 5 })
    await src.propose({ kind: 'habit_disable', habitId: 'arthus-ongles' })
    await src.propose({ kind: 'habit_disable', habitId: 'arthus-sport' })
    await src.propose({ kind: 'habit_disable', habitId: 'arthus-ongles' })
    await src.propose({ kind: 'habit_add', name: 'Eau', emoji: '💧', hint: '', habitKind: 'do' })
    await src.propose({ kind: 'habit_add', name: 'Sommeil', emoji: '😴', hint: '', habitKind: 'do' })
    const pending = src.getSnapshot().proposals.filter((p) => p.status === 'pending' && p.authorId === 'arthus')
    expect(pending.map((p) => p.payload)).toEqual([
      { kind: 'weigh_day', isoDay: 5 },
      { kind: 'habit_disable', habitId: 'arthus-sport' },
      { kind: 'habit_disable', habitId: 'arthus-ongles' },
      { kind: 'habit_add', name: 'Eau', emoji: '💧', hint: '', habitKind: 'do' },
      { kind: 'habit_add', name: 'Sommeil', emoji: '😴', hint: '', habitKind: 'do' },
    ])
    expect(src.getSnapshot().proposals.filter((p) => p.status === 'cancelled')).toHaveLength(2)
  })

  it('désactiver ou changer le type d’une même habitude : un seul sujet ; accepter sur une habitude close est refusé (R1)', async () => {
    const src = make('?reset=1&as=arthus')
    await src.propose({ kind: 'habit_kind', habitId: 'arthus-ongles', habitKind: 'do' })
    await src.propose({ kind: 'habit_disable', habitId: 'arthus-ongles' })
    const mine = src.getSnapshot().proposals.filter((p) => p.authorId === 'arthus')
    expect(mine.map((p) => [p.payload.kind, p.status])).toEqual([
      ['habit_kind', 'cancelled'],
      ['habit_disable', 'pending'],
    ])
    // L'habitude a été close entre-temps (autre proposition acceptée) : on ne la rouvre pas.
    const state = (src as unknown as { state: DemoState }).state
    state.habits = state.habits.map((h) => (h.id === 'arthus-ongles' ? { ...h, activeUntil: '2026-11-23' } : h))
    src.switchPlayer('laetitia')
    await expect(src.answerProposal(mine[1].id, true)).rejects.toThrow('Cette habitude est déjà désactivée 🤷')
    expect(src.getSnapshot().habits.find((h) => h.id === 'arthus-ongles')?.activeUntil).toBe('2026-11-23')
    await src.answerProposal(mine[1].id, false)
    expect(src.getSnapshot().proposals.find((p) => p.id === mine[1].id)?.status).toBe('refused')
    src.dispose()
  })

  it('sans approbation requise (RULES.proposals.requireApproval = false), la proposition est acceptée d’office', async () => {
    const saved = RULES.proposals.requireApproval
    RULES.proposals.requireApproval = false
    try {
      const src = make('?reset=1&as=arthus')
      await src.propose({ kind: 'weigh_day', isoDay: 6 })
      const p = src.getSnapshot().proposals.at(-1)!
      expect(p.status).toBe('accepted')
      expect(p.effectiveFrom).toBe('2026-11-23')
      expect(src.getSnapshot().settings.weighInDays.at(-1)).toEqual({ from: '2026-11-23', isoDay: 6 })
    } finally {
      RULES.proposals.requireApproval = saved
    }
  })
})

describe('DemoSource · badges', () => {
  it('enregistre seulement mes badges, une seule fois, et sans notifier pour rien', async () => {
    const src = make('?reset=1&as=arthus')
    const calls: DuelSnapshot[] = []
    src.subscribe((s) => calls.push(s))
    const unlock = { playerId: 'arthus', badgeId: 'machine', tier: null, day: '2026-11-15' }
    await src.recordBadgeUnlocks([unlock, { ...unlock, playerId: 'laetitia', badgeId: 'zen' }, { ...unlock }])
    await src.recordBadgeUnlocks([{ ...unlock, day: '2026-11-16' }])
    expect(src.getSnapshot().badgeUnlocks).toEqual([unlock])
    expect(calls).toHaveLength(1)
    // Les paliers 🪶 sont distincts.
    await src.recordBadgeUnlocks([{ playerId: 'arthus', badgeId: 'plume', tier: 2, day: '2026-11-15' }])
    expect(src.getSnapshot().badgeUnlocks).toHaveLength(2)
  })

  it('retient les célébrations vues par joueur, et reset les oublie', async () => {
    const src = make('?reset=1&as=arthus')
    await src.markBadgesSeen(['machine', 'plume:2', 'machine'])
    expect(src.getSnapshot().seenBadges).toEqual(['machine', 'plume:2'])
    src.switchPlayer('laetitia')
    expect(src.getSnapshot().seenBadges).toEqual([])
    src.switchPlayer('arthus')
    src.reset()
    expect(src.getSnapshot().seenBadges).toEqual([])
    expect(src.getSnapshot().badgeUnlocks).toEqual([])
  })
})

describe('DemoSource · connexion et minuteurs', () => {
  it('signIn(prénom, code) : refuse un code mal formé, accepte n’importe quels 6 chiffres', async () => {
    const src = make('?reset=1')
    expect(src.signedIn).toBe(false)
    expect((await src.loginPlayers()).map((p) => [p.id, p.hasCode])).toEqual([
      ['laetitia', true],
      ['arthus', true],
    ])
    await expect(src.signIn('laetitia', '12a4')).rejects.toThrow(/6\u00a0?chiffres|6 chiffres/)
    expect(src.signedIn).toBe(false)
    await src.signIn('laetitia', '123456')
    expect(src.signedIn).toBe(true)
    expect(src.getSnapshot().meId).toBe('laetitia')
    await expect(src.changeCode('123456', '12')).rejects.toThrow()
    await expect(src.changeCode('123456', '654321')).resolves.toBeUndefined()
  })

  it('signOut coupe les minuteurs : ni check-in simulé, ni réponse automatique après la déconnexion', async () => {
    vi.useFakeTimers()
    const src = make('?reset=1&as=arthus')
    const activities: Activity[] = []
    src.subscribe((_s, a) => a && activities.push(a))
    src.scheduleOtherCheckin()
    await src.propose({ kind: 'weigh_day', isoDay: 6 })
    await src.signOut()
    vi.advanceTimersByTime(60_000)
    expect(activities).toHaveLength(0)
    expect(checkinsOf(src.getSnapshot(), 'laetitia', '2026-11-16')).toHaveLength(0)
    expect(src.getSnapshot().proposals.at(-1)?.status).toBe('pending')
  })

  it('le check-in simulé vise l’autre du moment, jamais « moi »', () => {
    vi.useFakeTimers()
    const src = make('?reset=1&as=arthus')
    const activities: Activity[] = []
    src.subscribe((_s, a) => a && activities.push(a))
    src.scheduleOtherCheckin()
    src.switchPlayer('laetitia')
    vi.advanceTimersByTime(13_000)
    const snap = src.getSnapshot()
    expect(checkinsOf(snap, 'laetitia', '2026-11-16')).toHaveLength(0)
    expect(checkinsOf(snap, 'arthus', '2026-11-16').length).toBeGreaterThan(0)
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({ kind: 'checkin_done', playerId: 'arthus' })
    // « check‑in » avec un trait d'union insécable (jamais coupé en fin de ligne).
    expect(activities[0].text).toContain('check‑in')
  })

  it('dispose coupe aussi les minuteurs', () => {
    vi.useFakeTimers()
    const src = make('?reset=1&as=arthus')
    src.scheduleOtherCheckin()
    src.dispose()
    vi.advanceTimersByTime(60_000)
    expect(checkinsOf(src.getSnapshot(), 'laetitia', '2026-11-16')).toHaveLength(0)
  })

  it('la pesée « l’autre s’est déjà pesé ce matin » passe au nouvel autre quand on change de joueur', async () => {
    const src = make('?reset=1&as=arthus&day=2026-11-22')
    const weighedOn22 = () => src.getSnapshot().weighIns.filter((w) => w.day === '2026-11-22').map((w) => w.playerId)
    expect(weighedOn22()).toEqual(['laetitia'])
    src.switchPlayer('laetitia')
    expect(weighedOn22()).toEqual(['arthus'])
    // Une fois que j'ai fait ma vraie pesée, plus rien ne bouge.
    await src.saveWeighIn('2026-11-22', 64.4)
    src.signInAs('arthus')
    expect(weighedOn22().sort()).toEqual(['laetitia'])
    expect(src.getSnapshot().weighIns.find((w) => w.playerId === 'laetitia' && w.day === '2026-11-22')?.weightKg).toBeNull()
  })
})

describe('DemoSource · stockage', () => {
  it('régénère un état stocké d’une ancienne version', () => {
    const items = new Map<string, string>()
    const fake = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    }
    vi.stubGlobal('localStorage', fake)
    try {
      items.set('duel-demo-v1', JSON.stringify({ version: 1, anchorReal: '2026-11-16', today: '2026-11-16', meId: 'laetitia' }))
      const src = new DemoSource({ search: '', clock })
      expect(src.getSnapshot().badgeUnlocks).toEqual([])
      expect(JSON.parse(items.get('duel-demo-v1')!).version).toBe(2)
      // Et un état v2 est repris tel quel, avec ce qui a été fait.
      src.signInAs('arthus')
      const again = new DemoSource({ search: '', clock })
      expect(again.signedIn).toBe(true)
      expect(again.getSnapshot().meId).toBe('arthus')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
