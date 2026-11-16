/**
 * Source de données de la maquette : tout en mémoire (+ localStorage), sans backend.
 * Simule l'adversaire en temps réel pour voir le Ring bouger et les toasts.
 * Tient les garanties de DuelSource (voir l'en-tête de source.ts).
 */
import { RULES } from '../../config/rules'
import { addDays, atSameTimeOn, dayKeyAt, daysRange, nextMonday, weekEndOf, weekStartOf } from '../../core/dates'
import { typo } from '../../core/fr'
import { activeHabits, canEditCheckin, canWeighIn, isWeighInDay, percentChange, valuesFor } from '../../core/scoring'
import { isStakeEditable } from '../../core/season'
import { drawStake } from '../../core/stake'
import type {
  BadgeUnlock,
  CheckinValue,
  DayKey,
  DuelSnapshot,
  Habit,
  PlayerId,
  Proposal,
  ProposalPayload,
} from '../../core/types'
import { deriveWeighIns } from '../../core/weight'
import { CODE_LENGTH, type Activity, type DemoControls, type DuelSource, type HabitLookPatch, type LoginPlayer, type ProfilePatch } from '../source'
import {
  DEMO_VERSION,
  demoTravelDays,
  demoWeight,
  generateDayCheckins,
  generateDemoState,
  lastHabitOf,
  makeRng,
  type DemoState,
} from './generate'

const STORAGE_KEY = 'duel-demo-v1'
/** Anciennes clés des badges déjà fêtés (avant qu'ils passent dans l'état) : effacées au reset. */
const LEGACY_BADGES_SEEN_PREFIX = 'duel-badges-seen-'

/** « check‑in » avec un trait d'union insécable : jamais coupé en fin de ligne. */
const CHECKIN = 'check‑in'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function clearLegacyBadgesSeen() {
  try {
    const s = storage()
    if (!s) return
    for (const key of Object.keys(s)) if (key.startsWith(LEGACY_BADGES_SEEN_PREFIX)) s.removeItem(key)
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

function load(): DemoState | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as DemoState
    // Un état d'une ancienne version est régénéré.
    return s.version === DEMO_VERSION ? s : null
  } catch {
    return null
  }
}

function currentSearch(): string {
  try {
    return typeof location === 'undefined' ? '' : location.search
  } catch {
    return ''
  }
}

function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

/** Même règle de format que le serveur (claim_player) : exactement CODE_LENGTH chiffres. */
function checkCodeFormat(code: string) {
  if (!new RegExp(`^[0-9]{${CODE_LENGTH}}$`).test(code)) throw new Error(typo(`Le code, c’est ${CODE_LENGTH} chiffres 🔢`))
}

/** Même sujet = la nouvelle proposition remplace l'ancienne (garantie 6 de source.ts). */
function sameSubject(a: ProposalPayload, b: ProposalPayload): boolean {
  if (a.kind !== b.kind) return false
  if ((a.kind === 'habit_disable' || a.kind === 'habit_kind') && (b.kind === 'habit_disable' || b.kind === 'habit_kind')) {
    return a.habitId === b.habitId
  }
  // Deux nouvelles habitudes différentes ne se remplacent pas (même nom = même sujet).
  if (a.kind === 'habit_add' && b.kind === 'habit_add') return a.name.trim().toLowerCase() === b.name.trim().toLowerCase()
  return true
}

type Listener = (snapshot: DuelSnapshot, activity?: Activity) => void
type Timer = ReturnType<typeof setTimeout>

export interface DemoSourceOptions {
  /** Paramètres d'URL (?reset, ?as, ?day, ?seen). Défaut : location.search. */
  search?: string
  /** Horloge réelle. Défaut : maintenant (les tests en passent une fixe). */
  clock?: () => Date
  /** Mémoriser l'état dans localStorage. Défaut : oui. */
  persist?: boolean
}

export class DemoSource implements DuelSource, DemoControls {
  readonly mode = 'demo' as const
  /** Tout est en mémoire : jamais d'attente ni de problème de serveur. */
  readonly loading = false
  readonly problem = null
  private state: DemoState
  private listeners = new Set<Listener>()
  private snapshot: DuelSnapshot
  private timers = new Set<Timer>()
  /** Check-in automatique de l'adversaire en attente (un seul à la fois). */
  private otherTimer: Timer | null = null
  private clock: () => Date
  private persistState: boolean

  constructor(opts: DemoSourceOptions = {}) {
    this.clock = opts.clock ?? (() => new Date())
    this.persistState = opts.persist ?? true
    const realToday = this.realToday()
    const params = new URLSearchParams(opts.search ?? currentSearch())
    const reset = params.has('reset')
    if (reset) clearLegacyBadgesSeen()
    const stored = reset || !this.persistState ? null : load()
    // Paramètres d'URL pratiques pour tester : ?as=laetitia&day=2026-11-19
    const asParam = params.get('as')
    const as: PlayerId | null = asParam === 'arthus' || asParam === 'laetitia' ? asParam : null
    const dayParam = params.get('day')
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && addDays(dayParam, 0) === dayParam ? dayParam : null

    if (stored && stored.anchorReal === realToday) {
      // On garde ce qui a été fait : changer de joueur ou de jour passe par les mêmes règles que la démo.
      this.state = stored
      if (as) this.setMe(as)
      if (day && day !== stored.today) this.travel(day)
    } else {
      this.state = generateDemoState(day ?? realToday, realToday, as ?? stored?.meId ?? 'arthus')
    }
    if (as) this.state.signedIn = true
    // ?seen=1 : ne pas ouvrir la cérémonie automatiquement (pratique pour les captures).
    if (params.get('seen') === '1') {
      const last = addDays(weekStartOf(this.state.today), -7)
      for (const p of this.state.players) {
        const list = this.state.seenResults[p.id] ?? []
        if (!list.includes(last)) this.state.seenResults[p.id] = [...list, last]
      }
    }
    this.ensureStakes()
    this.save()
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

  /** Le jour simulé, à l'heure réelle de Paris. */
  now(): Date {
    return atSameTimeOn(this.state.today, this.clock())
  }

  get signedIn(): boolean {
    return this.state.signedIn
  }

  /** En maquette, les deux prénoms ont déjà un code (n'importe quel code à 6 chiffres marche). */
  async loginPlayers(): Promise<LoginPlayer[]> {
    return this.state.players.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, hasCode: true }))
  }

  /** Comme le vrai serveur, refuse un code mal formé ; sinon n'importe quel code ouvre la maquette. */
  async signIn(playerId: PlayerId, code: string): Promise<void> {
    checkCodeFormat(code)
    if (!this.state.players.some((p) => p.id === playerId)) throw new Error('Joueur inconnu 🤔')
    this.signInAs(playerId)
  }

  async changeCode(oldCode: string, newCode: string): Promise<void> {
    checkCodeFormat(oldCode)
    checkCodeFormat(newCode)
  }

  /** Coupe les minuteurs et les abonnés. La démo reste utilisable (React StrictMode remonte le Provider). */
  dispose(): void {
    this.clearTimers()
    this.listeners.clear()
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

  /** Le snapshot du joueur connecté : copie profonde, kilos de l'autre masqués (garantie 3). */
  private buildSnapshot(): DuelSnapshot {
    const s = this.state
    const reveal = (pid: PlayerId) => pid === s.meId || !!s.players.find((p) => p.id === pid)?.showKg
    const weighIns = deriveWeighIns(s.weighIns, (pid, day) => this.goalAt(pid, day), reveal)
    const players = s.players.map(({ key: _key, ...p }) => {
      const first = s.weighIns.filter((w) => w.playerId === p.id).sort((a, b) => (a.day < b.day ? -1 : 1))[0]
      // Objectif en vigueur aujourd'hui (le dernier, même s'il démarre lundi prochain, est montré à part).
      const goal = this.goalAt(p.id, this.state.today)
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
      settings: {
        ...s.settings,
        weighInDays: s.settings.weighInDays.map((r) => ({ ...r })),
        gages: [...s.settings.gages],
      },
      // L'objectif en kg d'une proposition de l'autre ne quitte pas l'état (décision 18).
      proposals: s.proposals.map((p) => ({
        ...p,
        payload:
          p.payload.kind === 'goal_weight' && !reveal(p.authorId) ? { ...p.payload, goalKg: null } : { ...p.payload },
      })),
      seenResults: [...(s.seenResults[s.meId] ?? [])],
      badgeUnlocks: (s.badgeUnlocks ?? []).map((u) => ({ ...u })),
      seenBadges: [...(s.seenBadges?.[s.meId] ?? [])],
    }
  }

  private save() {
    if (!this.persistState) return
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      // Stockage indisponible (navigation privée…) : la démo marche quand même, sans mémoire.
    }
  }

  /** Applique, enregistre et notifie avant de rendre la main (garantie 1). */
  private commit(activity?: Activity) {
    this.ensureStakes()
    this.save()
    this.snapshot = this.buildSnapshot()
    for (const l of [...this.listeners]) l(this.snapshot, activity)
  }

  private later(ms: number, fn: () => void): Timer {
    const t = globalThis.setTimeout(() => {
      this.timers.delete(t)
      fn()
    }, ms)
    this.timers.add(t)
    return t
  }

  private clearTimers() {
    for (const t of this.timers) globalThis.clearTimeout(t)
    this.timers.clear()
    this.otherTimer = null
  }

  private cancelOtherTimer() {
    if (this.otherTimer === null) return
    globalThis.clearTimeout(this.otherTimer)
    this.timers.delete(this.otherTimer)
    this.otherTimer = null
  }

  /** Garantie 5 : toute manche commencée a un enjeu, tiré au sort s'il manque. */
  private ensureStakes() {
    if (!RULES.stake.autoDrawOnMonday) return
    const s = this.state
    const last = weekStartOf(s.today)
    let changed = false
    for (let ws = weekStartOf(s.settings.seasonStart); ws <= last; ws = addDays(ws, 7)) {
      const meta = s.weeks.find((w) => w.weekStart === ws)
      if (meta?.stake?.trim()) continue
      const previous = s.weeks.find((w) => w.weekStart === addDays(ws, -7))?.stake ?? null
      const stake = drawStake(s.settings.gages, ws, previous)
      if (!stake) continue
      if (meta) meta.stake = stake
      else s.weeks.push({ weekStart: ws, stake, gagePaid: {} })
      changed = true
    }
    if (changed) s.weeks.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
  }

  private isDayComplete(playerId: PlayerId, day: DayKey): boolean {
    const habits = activeHabits(this.state.habits, playerId, day)
    return habits.length > 0 && habits.every((h) => this.state.checkins.some((c) => c.playerId === playerId && c.habitId === h.id && c.day === day))
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  async setCheckin(day: DayKey, habitId: string, value: CheckinValue | null): Promise<void> {
    const habit = this.state.habits.find((h) => h.id === habitId && h.playerId === this.state.meId)
    if (!habit) throw new Error('Habitude inconnue 🤔')
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
    // Ma pesée est la vraie : plus rien à déplacer.
    if (this.state.morningWeighIn?.playerId === me && this.state.morningWeighIn.day === day) this.state.morningWeighIn = null
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
    const me = this.state.meId
    const at = new Date().toISOString()
    // Une seule proposition en attente par sujet : la nouvelle remplace l'ancienne (décision 17).
    for (const p of this.state.proposals) {
      if (p.status === 'pending' && p.authorId === me && sameSubject(p.payload, payload)) {
        p.status = 'cancelled'
        p.decidedAt = at
      }
    }
    const proposal: Proposal = {
      id: uid(),
      authorId: me,
      payload: { ...payload },
      status: 'pending',
      createdAt: at,
      decidedAt: null,
      effectiveFrom: null,
    }
    this.state.proposals.push(proposal)
    if (!RULES.proposals.requireApproval) {
      // Pas besoin de l'accord de l'autre : acceptée d'office.
      this.decide(proposal, true)
      this.commit()
      return
    }
    this.commit()
    // L'adversaire (simulé) répond au bout de quelques secondes.
    const other = this.otherId
    this.later(4500, () => {
      const p = this.state.proposals.find((x) => x.id === proposal.id)
      // Déconnecté, ou on a changé de joueur entre-temps (c'est à « moi » de répondre) : pas de réponse automatique.
      if (!p || p.status !== 'pending' || !this.state.signedIn || this.state.meId !== p.authorId) return
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
      // L'état garde les vrais kilos de l'auteur (le snapshot de l'autre ne les voit jamais).
      const kg = pl.clear ? null : pl.goalKg
      if (!pl.clear && kg === null) return
      this.state.goals = [...this.state.goals.filter((g) => !(g.playerId === author && g.from === from)), { playerId: author, from, kg }]
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
    this.state.settings.gages = [...gages]
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
    if (list.includes(weekStart)) return
    this.state.seenResults[this.state.meId] = [...list, weekStart]
    this.commit()
  }

  async recordBadgeUnlocks(unlocks: BadgeUnlock[]): Promise<void> {
    const me = this.state.meId
    const stored = (this.state.badgeUnlocks ??= [])
    let added = false
    for (const u of unlocks) {
      // On n'enregistre que ses propres badges, une seule fois chacun (et chaque palier).
      if (u.playerId !== me) continue
      const tier = u.tier ?? null
      if (stored.some((x) => x.playerId === me && x.badgeId === u.badgeId && x.tier === tier)) continue
      stored.push({ playerId: me, badgeId: u.badgeId, tier, day: u.day })
      added = true
    }
    if (added) this.commit()
  }

  async markBadgesSeen(keys: string[]): Promise<void> {
    const me = this.state.meId
    this.state.seenBadges ??= {}
    const seen = new Set(this.state.seenBadges[me] ?? [])
    const fresh = keys.filter((k) => !seen.has(k))
    if (fresh.length === 0) return
    this.state.seenBadges[me] = [...seen, ...new Set(fresh)]
    this.commit()
  }

  async signOut(): Promise<void> {
    // Plus de toast ni de check-in simulé sur l'écran de connexion.
    this.clearTimers()
    this.state.signedIn = false
    this.commit()
  }

  // ─── Simulation de l'adversaire ──────────────────────────────────────────

  /** Au premier lancement de la journée, l'adversaire fait son check-in au bout de ~12 s. */
  scheduleOtherCheckin(): void {
    if (!this.state.signedIn || this.state.otherAutoCheckinDone || this.otherTimer !== null) return
    const target = this.otherId
    const day = this.today
    this.otherTimer = this.later(12_000, () => {
      this.otherTimer = null
      const s = this.state
      // Rien si déconnecté, si la cible est devenue « moi », si on a voyagé ou si c'est déjà fait.
      if (!s.signedIn || s.meId === target || s.today !== day || s.otherAutoCheckinDone) return
      s.otherAutoCheckinDone = true
      if (this.isDayComplete(target, day)) {
        this.save()
        return
      }
      this.simulateOtherCheckin()
    })
  }

  simulateOtherCheckin(): void {
    const other = this.otherId
    const rng = makeRng(Date.now() % 100000)
    for (const h of activeHabits(this.state.habits, other, this.today)) {
      const values = valuesFor(h.kind)
      const r = rng()
      const value = h.kind === 'avoid' ? (r < 0.6 ? values[0] : r < 0.85 ? values[1] : values[2]) : r < 0.65 ? values[0] : values[1]
      this.upsertCheckin(other, h.id, this.today, value)
    }
    this.commit({ kind: 'checkin_done', playerId: other, text: `👀 ${this.nameOf(other)} vient de faire son ${CHECKIN}` })
  }

  // ─── Commandes de démo ───────────────────────────────────────────────────

  /** « Jouer en tant que » (écran de connexion de la démo). */
  signInAs(playerId: PlayerId): void {
    if (!this.state.players.some((p) => p.id === playerId)) return
    this.setMe(playerId)
    this.state.signedIn = true
    this.commit()
    this.scheduleOtherCheckin()
  }

  switchPlayer(playerId: PlayerId): void {
    if (!this.state.players.some((p) => p.id === playerId) || playerId === this.state.meId) return
    this.setMe(playerId)
    this.commit()
    this.scheduleOtherCheckin()
  }

  /** Change « moi » (sans notifier) : le check-in simulé et la pesée du matin suivent le nouvel « autre ». */
  private setMe(playerId: PlayerId) {
    if (playerId === this.state.meId) return
    this.cancelOtherTimer()
    this.state.meId = playerId
    this.moveMorningWeighIn()
  }

  /** « L'autre s'est déjà pesé ce matin » : la pesée inventée passe au nouvel « autre ». */
  private moveMorningWeighIn() {
    const s = this.state
    const m = s.morningWeighIn
    if (!m || m.playerId !== s.meId) return
    s.morningWeighIn = null
    if (m.day !== s.today) return
    s.weighIns = s.weighIns.filter((w) => !(w.playerId === m.playerId && w.day === m.day))
    const other = this.otherId
    if (!isWeighInDay(m.day, s.settings) || s.weighIns.some((w) => w.playerId === other && w.day === m.day)) return
    s.weighIns.push({ playerId: other, day: m.day, weightKg: demoWeight(other, m.day, s.weighIns) })
    s.morningWeighIn = { playerId: other, day: m.day }
  }

  /** Les jours où l'on peut voyager : la vraie semaine + le lundi suivant. */
  travelDays(): DayKey[] {
    return demoTravelDays(this.realToday())
  }

  setToday(day: DayKey): void {
    if (!this.travel(day)) return
    // Le check-in simulé visait l'ancien jour ; les réponses aux propositions, elles, restent prévues.
    this.cancelOtherTimer()
    this.commit()
    this.scheduleOtherCheckin()
  }

  /**
   * Voyage dans le temps sans perdre ce que le joueur a fait (sans notifier).
   * - En avant : seuls les jours manquants sont inventés (voir advance).
   * - En arrière : tout ce qui est après le nouveau jour est effacé.
   */
  private travel(day: DayKey): boolean {
    const s = this.state
    if (day === s.today || day < s.settings.seasonStart || addDays(day, 0) !== day) return false
    if (day > s.today) this.advance(s.today, day)
    else this.rewind(day)
    s.today = day
    s.otherAutoCheckinDone = false
    if (s.morningWeighIn && s.morningWeighIn.day !== day) s.morningWeighIn = null
    // Jour de la pesée : l'autre s'est déjà pesé ce matin.
    const other = this.otherId
    if (isWeighInDay(day, s.settings) && !s.weighIns.some((w) => w.playerId === other && w.day === day)) {
      s.weighIns.push({ playerId: other, day, weightKg: demoWeight(other, day, s.weighIns) })
      s.morningWeighIn = { playerId: other, day }
    }
    return true
  }

  /**
   * Jours de `from` (l'ancien aujourd'hui) à la veille de `to` :
   * - l'autre : check-in inventé pour chaque jour vide (l'ancien aujourd'hui compris) ;
   * - moi : pareil, sauf la veille, où ma dernière habitude reste vide (rattrapage à montrer) ;
   * - pesées des jours de pesée passés, pour qui ne s'est pas pesé.
   */
  private advance(from: DayKey, to: DayKey) {
    const s = this.state
    const me = s.meId
    const other = this.otherId
    const eve = addDays(to, -1)
    const start = from < s.settings.seasonStart ? s.settings.seasonStart : from
    const hasDay = (pid: PlayerId, d: DayKey) => s.checkins.some((c) => c.playerId === pid && c.day === d)
    for (const d of daysRange(start, eve)) {
      if (!hasDay(other, d)) s.checkins.push(...generateDayCheckins(s.habits, other, d))
      if (!hasDay(me, d)) {
        let mine = generateDayCheckins(s.habits, me, d)
        const last = lastHabitOf(s.habits, me, d)
        if (d === eve && last && canEditCheckin(d, to, s.settings)) mine = mine.filter((c) => c.habitId !== last.id)
        s.checkins.push(...mine)
      }
      if (isWeighInDay(d, s.settings)) {
        for (const pid of [me, other]) {
          if (!s.weighIns.some((w) => w.playerId === pid && w.day === d)) s.weighIns.push({ playerId: pid, day: d, weightKg: demoWeight(pid, d, s.weighIns) })
        }
      }
    }
  }

  /** Retour en arrière : on efface tout ce qui est après le nouveau jour. */
  private rewind(to: DayKey) {
    const s = this.state
    s.checkins = s.checkins.filter((c) => c.day <= to)
    s.weighIns = s.weighIns.filter((w) => w.day <= to)
    // Manches pas encore commencées, cérémonies de manches pas encore finies, badges du futur.
    s.weeks = s.weeks.filter((w) => w.weekStart <= to)
    for (const pid of Object.keys(s.seenResults)) s.seenResults[pid] = s.seenResults[pid].filter((ws) => weekEndOf(ws) < to)
    s.badgeUnlocks = (s.badgeUnlocks ?? []).filter((u) => u.day <= to)
  }

  realToday(): DayKey {
    return dayKeyAt(this.clock())
  }

  replayResults(): void {
    const ws = addDays(weekStartOf(this.today), -7)
    this.state.seenResults[this.state.meId] = (this.state.seenResults[this.state.meId] ?? []).filter((d) => d !== ws)
    this.commit()
  }

  /** Repart de zéro (célébrations comprises), en gardant le joueur et la connexion. */
  reset(): void {
    const { signedIn, meId } = this.state
    const realToday = this.realToday()
    this.clearTimers()
    clearLegacyBadgesSeen()
    this.state = generateDemoState(realToday, realToday, meId)
    this.state.signedIn = signedIn
    this.commit()
    this.scheduleOtherCheckin()
  }
}
