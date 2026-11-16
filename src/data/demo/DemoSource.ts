/**
 * Source de données de la maquette : tout en mémoire (+ localStorage), sans backend.
 * Simule l'adversaire en temps réel pour voir le Ring bouger et les toasts.
 */
import { addDays, dayKeyAt, diffDays, nextMonday, weekStartOf } from '../../core/dates'
import { canEditCheckin, canWeighIn, percentChange, valuesFor } from '../../core/scoring'
import { isStakeEditable } from '../../core/season'
import type { CheckinValue, DayKey, DuelSnapshot, Habit, PlayerId, Proposal, ProposalPayload } from '../../core/types'
import { deriveWeighIns } from '../../core/weight'
import type { Activity, DemoControls, DuelSource, HabitLookPatch, ProfilePatch } from '../source'
import { generateDemoState, makeRng, type DemoState } from './generate'

const STORAGE_KEY = 'duel-demo-v1'

function load(): DemoState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as DemoState
    return s.version === 1 ? s : null
  } catch {
    return null
  }
}

function save(state: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Stockage indisponible (navigation privée…) : la démo marche quand même, sans mémoire.
  }
}

function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

type Listener = (snapshot: DuelSnapshot, activity?: Activity) => void

export class DemoSource implements DuelSource, DemoControls {
  readonly mode = 'demo' as const
  private state: DemoState
  private listeners = new Set<Listener>()
  private snapshot: DuelSnapshot
  private timers: number[] = []

  constructor() {
    const realToday = dayKeyAt(new Date())
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
    const stored = params.has('reset') ? null : load()
    this.state = stored && stored.anchorReal === realToday ? stored : generateDemoState(realToday, realToday, stored?.meId ?? 'arthus')
    // Paramètres d'URL pratiques pour tester : ?as=laetitia&day=2026-11-19
    const as = params.get('as')
    const day = params.get('day')
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day !== this.state.today) {
      this.state = generateDemoState(day, realToday, this.state.meId)
    }
    if (as === 'arthus' || as === 'laetitia') {
      this.state.meId = as
      this.state.signedIn = true
    }
    // ?seen=1 : ne pas ouvrir la cérémonie automatiquement (pratique pour les captures).
    if (params.get('seen') === '1') {
      const last = addDays(weekStartOf(this.state.today), -7)
      for (const p of this.state.players) {
        const list = this.state.seenResults[p.id] ?? []
        if (!list.includes(last)) this.state.seenResults[p.id] = [...list, last]
      }
    }
    save(this.state)
    this.snapshot = this.buildSnapshot()
  }

  // ─── Lecture ─────────────────────────────────────────────────────────────

  getSnapshot(): DuelSnapshot {
    return this.snapshot
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  now(): Date {
    const realToday = dayKeyAt(new Date())
    return new Date(Date.now() + diffDays(realToday, this.state.today) * 86_400_000)
  }

  get signedIn(): boolean {
    return this.state.signedIn
  }

  signIn(playerId: PlayerId) {
    this.state.meId = playerId
    this.state.signedIn = true
    this.commit()
    this.scheduleOtherCheckin()
  }

  private get today(): DayKey {
    return this.state.today
  }

  private get otherId(): PlayerId {
    return this.state.players.find((p) => p.id !== this.state.meId)!.id
  }

  private nameOf(id: PlayerId): string {
    return this.state.players.find((p) => p.id === id)?.name ?? '?'
  }

  private goalAt(playerId: PlayerId, day: DayKey): number | null {
    return this.state.goals.filter((g) => g.playerId === playerId && g.from <= day).sort((a, b) => (a.from < b.from ? -1 : 1)).at(-1)?.kg ?? null
  }

  private buildSnapshot(): DuelSnapshot {
    const s = this.state
    const reveal = (pid: PlayerId) => pid === s.meId || !!s.players.find((p) => p.id === pid)?.showKg
    const weighIns = deriveWeighIns(s.weighIns, (pid, day) => this.goalAt(pid, day), reveal)
    const players = s.players.map(({ key: _key, ...p }) => {
      const first = s.weighIns.filter((w) => w.playerId === p.id).sort((a, b) => (a.day < b.day ? -1 : 1))[0]
      // Objectif en vigueur aujourd'hui (le dernier, même s'il démarre lundi prochain, est montré à part).
      const goal = this.goalAt(p.id, this.today)
      return {
        ...p,
        goalKg: reveal(p.id) ? goal : null,
        goalFromStartPct: goal && first ? percentChange(first.weightKg, goal) : null,
      }
    })
    return {
      meId: s.meId,
      players,
      habits: s.habits.map((h) => ({ ...h })),
      checkins: s.checkins.map((c) => ({ ...c })),
      weighIns,
      weeks: s.weeks.map((w) => ({ ...w, gagePaid: { ...w.gagePaid } })),
      settings: { ...s.settings, weighInDays: [...s.settings.weighInDays], gages: [...s.settings.gages] },
      proposals: s.proposals.map((p) => ({ ...p })),
      seenResults: [...(s.seenResults[s.meId] ?? [])],
    }
  }

  private commit(activity?: Activity) {
    save(this.state)
    this.snapshot = this.buildSnapshot()
    for (const l of this.listeners) l(this.snapshot, activity)
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms))
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  async setCheckin(day: DayKey, habitId: string, value: CheckinValue | null): Promise<void> {
    const habit = this.state.habits.find((h) => h.id === habitId && h.playerId === this.state.meId)
    if (!habit) throw new Error('Habitude inconnue')
    if (!canEditCheckin(day, this.today, this.state.settings)) throw new Error('Ce jour n’est plus modifiable 🔒')
    this.upsertCheckin(this.state.meId, habitId, day, value)
    this.commit()
  }

  private upsertCheckin(playerId: PlayerId, habitId: string, day: DayKey, value: CheckinValue | null) {
    this.state.checkins = this.state.checkins.filter((c) => !(c.playerId === playerId && c.habitId === habitId && c.day === day))
    if (value) this.state.checkins.push({ playerId, habitId, day, value, updatedAt: new Date().toISOString() })
  }

  async saveWeighIn(day: DayKey, weightKg: number): Promise<void> {
    if (day !== this.today || !canWeighIn(day, this.state.settings)) throw new Error('Ce n’est pas le jour de la pesée ⚖️')
    const me = this.state.meId
    this.state.weighIns = this.state.weighIns.filter((w) => !(w.playerId === me && w.day === day))
    this.state.weighIns.push({ playerId: me, day, weightKg: Math.round(weightKg * 10) / 10 })
    this.commit()
  }

  async updateProfile(patch: ProfilePatch): Promise<void> {
    this.state.players = this.state.players.map((p) => (p.id === this.state.meId ? { ...p, ...patch } : p))
    this.commit()
  }

  async updateHabitLook(habitId: string, patch: HabitLookPatch): Promise<void> {
    this.state.habits = this.state.habits.map((h) => (h.id === habitId && h.playerId === this.state.meId ? { ...h, ...patch } : h))
    this.commit()
  }

  async propose(payload: ProposalPayload): Promise<void> {
    const proposal: Proposal = {
      id: uid(),
      authorId: this.state.meId,
      payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
      decidedAt: null,
      effectiveFrom: null,
    }
    this.state.proposals.push(proposal)
    this.commit()
    // L'adversaire (simulé) répond au bout de quelques secondes.
    const other = this.otherId
    this.later(4500, () => {
      const p = this.state.proposals.find((x) => x.id === proposal.id)
      if (!p || p.status !== 'pending') return
      this.decide(p, true)
      this.commit({ kind: 'proposal_accepted', playerId: other, text: `✅ ${this.nameOf(other)} a accepté ta proposition (effet lundi)` })
    })
  }

  private decide(p: Proposal, accept: boolean) {
    p.status = accept ? 'accepted' : 'refused'
    p.decidedAt = new Date().toISOString()
    if (!accept) return
    const from = nextMonday(this.today)
    p.effectiveFrom = from
    const pl = p.payload
    const author = p.authorId
    if (pl.kind === 'habit_add') {
      const order = Math.max(-1, ...this.state.habits.filter((h) => h.playerId === author).map((h) => h.sortOrder)) + 1
      this.state.habits.push({
        id: uid(),
        playerId: author,
        name: pl.name,
        hint: pl.hint,
        emoji: pl.emoji,
        kind: pl.habitKind,
        badgeKey: null,
        activeFrom: from,
        activeUntil: null,
        sortOrder: order,
      })
    } else if (pl.kind === 'habit_disable') {
      this.state.habits = this.state.habits.map((h) => (h.id === pl.habitId ? { ...h, activeUntil: from } : h))
    } else if (pl.kind === 'habit_kind') {
      // On clôt l'ancienne habitude et on en crée une nouvelle : l'historique garde son type.
      const old = this.state.habits.find((h) => h.id === pl.habitId)
      if (!old) return
      this.state.habits = this.state.habits.map((h) => (h.id === old.id ? { ...h, activeUntil: from } : h))
      const fresh: Habit = { ...old, id: uid(), kind: pl.habitKind, badgeKey: null, activeFrom: from, activeUntil: null }
      this.state.habits.push(fresh)
    } else if (pl.kind === 'weigh_day') {
      this.state.settings.weighInDays = [...this.state.settings.weighInDays.filter((r) => r.from !== from), { from, isoDay: pl.isoDay }]
    } else if (pl.kind === 'goal_weight') {
      this.state.goals = [...this.state.goals.filter((g) => !(g.playerId === author && g.from === from)), { playerId: author, from, kg: pl.goalKg }]
    }
  }

  async answerProposal(proposalId: string, accept: boolean): Promise<void> {
    const p = this.state.proposals.find((x) => x.id === proposalId)
    if (!p || p.status !== 'pending' || p.authorId === this.state.meId) return
    this.decide(p, accept)
    this.commit()
  }

  async cancelProposal(proposalId: string): Promise<void> {
    const p = this.state.proposals.find((x) => x.id === proposalId)
    if (!p || p.status !== 'pending' || p.authorId !== this.state.meId) return
    p.status = 'cancelled'
    p.decidedAt = new Date().toISOString()
    this.commit()
  }

  async setStake(weekStart: DayKey, stake: string): Promise<void> {
    if (!isStakeEditable(weekStart, this.today)) throw new Error('L’enjeu est verrouillé 🔒')
    const w = this.state.weeks.find((x) => x.weekStart === weekStart)
    if (w) w.stake = stake
    else this.state.weeks.push({ weekStart, stake, gagePaid: {} })
    this.commit()
  }

  async setGages(gages: string[]): Promise<void> {
    this.state.settings.gages = gages
    this.commit()
  }

  async setGagePaid(weekStart: DayKey, playerId: PlayerId, paid: boolean): Promise<void> {
    // C'est l'autre (le gagnant) qui valide le gage.
    if (playerId === this.state.meId) throw new Error('C’est à l’autre de valider ton gage 😉')
    const w = this.state.weeks.find((x) => x.weekStart === weekStart)
    if (w) w.gagePaid = { ...w.gagePaid, [playerId]: paid }
    else this.state.weeks.push({ weekStart, stake: null, gagePaid: { [playerId]: paid } })
    this.commit()
  }

  async markResultsSeen(weekStart: DayKey): Promise<void> {
    const list = this.state.seenResults[this.state.meId] ?? []
    if (!list.includes(weekStart)) this.state.seenResults[this.state.meId] = [...list, weekStart]
    this.commit()
  }

  async signOut(): Promise<void> {
    this.state.signedIn = false
    this.commit()
  }

  // ─── Simulation de l'adversaire ──────────────────────────────────────────

  /** Au premier lancement de la journée, l'adversaire fait son check-in au bout de ~12 s. */
  scheduleOtherCheckin() {
    if (this.state.otherAutoCheckinDone || !this.state.signedIn) return
    this.later(12_000, () => {
      if (this.state.otherAutoCheckinDone) return
      this.state.otherAutoCheckinDone = true
      this.simulateOtherCheckin()
    })
  }

  simulateOtherCheckin(): void {
    const other = this.otherId
    const rng = makeRng(Date.now() % 100000)
    for (const h of this.state.habits.filter((x) => x.playerId === other && x.activeFrom <= this.today && (!x.activeUntil || this.today < x.activeUntil))) {
      const values = valuesFor(h.kind)
      const r = rng()
      const value = h.kind === 'avoid' ? (r < 0.6 ? values[0] : r < 0.85 ? values[1] : values[2]) : r < 0.65 ? values[0] : values[1]
      this.upsertCheckin(other, h.id, this.today, value)
    }
    this.commit({ kind: 'checkin_done', playerId: other, text: `👀 ${this.nameOf(other)} vient de faire son check-in` })
  }

  // ─── Commandes de démo ───────────────────────────────────────────────────

  switchPlayer(playerId: PlayerId): void {
    this.state.meId = playerId
    this.commit()
  }

  setToday(day: DayKey): void {
    const keep = this.state
    this.state = generateDemoState(day, dayKeyAt(new Date()), keep.meId)
    this.state.signedIn = keep.signedIn
    // On garde la personnalisation des joueurs.
    this.state.players = this.state.players.map((p) => {
      const old = keep.players.find((o) => o.id === p.id)
      return old ? { ...p, name: old.name, emoji: old.emoji, color: old.color, showKg: old.showKg } : p
    })
    this.timers.forEach((t) => clearTimeout(t))
    this.timers = []
    this.commit()
    this.scheduleOtherCheckin()
  }

  realToday(): DayKey {
    return dayKeyAt(new Date())
  }

  replayResults(): void {
    const ws = addDays(weekStartOf(this.today), -7)
    this.state.seenResults[this.state.meId] = (this.state.seenResults[this.state.meId] ?? []).filter((d) => d !== ws)
    this.commit()
  }

  reset(): void {
    const signedIn = this.state.signedIn
    const realToday = dayKeyAt(new Date())
    this.state = generateDemoState(realToday, realToday, this.state.meId)
    this.state.signedIn = signedIn
    this.timers.forEach((t) => clearTimeout(t))
    this.timers = []
    this.commit()
    this.scheduleOtherCheckin()
  }
}
