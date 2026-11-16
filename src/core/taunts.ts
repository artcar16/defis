/**
 * 😈 Choix des phrases taquines selon la situation. Module pur.
 * Les textes eux-mêmes sont dans src/content/phrases.ts (faciles à modifier).
 *
 * Principe commun :
 * 1. on garde les phrases dont toutes les conditions sont vraies et dont tous
 *    les {trous} peuvent être remplis ;
 * 2. on en tire une au sort de façon STABLE à partir de la graine (le jour) :
 *    même situation + même jour = même phrase (pas de clignotement), mais ça
 *    change d'un jour à l'autre ;
 * 3. chaque condition double les chances d'une phrase : les plus précises sont
 *    favorisées sans écraser complètement les phrases génériques.
 *
 * Ring : les situations urgentes passent avant tout, dans cet ordre :
 * duel pas commencé → rappel du soir (mon check-in pas fait) → jour de la pesée
 * (pas encore pesé·e) → l'autre n'a pas fait son check-in 👀. Sinon, une
 * situation est tirée au sort (de façon stable, pondérée) parmi celles qui
 * s'appliquent : jour de la semaine, score, revanche, titre à défendre,
 * séries 🔥, bilan global.
 */
import { RULES } from '../config/rules'
import {
  CHECKIN_PHRASES,
  RESULTS_PHRASES,
  RING_PHRASES,
  WEIGHIN_REACTIONS,
  type CheckinState,
  type DayBucket,
  type GapBucket,
  type Lead,
  type RingPhrase,
  type RingSituation,
  type WeighInBucket,
} from '../content/phrases'
import type { DayScore } from './scoring'
import type { SeasonRecord } from './season'
import type { CheckinValue, DayKey, Player } from './types'

export interface StreakHighlight {
  playerId: string
  habitName: string
  emoji: string
  days: number
}

/** Tout ce qu'il faut savoir pour choisir la phrase du Ring. */
export interface RingTauntContext {
  me: Player
  other: Player
  /** Score de la semaine en cours. */
  myTotal: number
  otherTotal: number
  /** Jour de la semaine, 1 = lundi … 7 = dimanche. */
  isoDay: number
  /** Heure à Paris (0-23). */
  hour: number
  daysLeft: number
  myToday: DayScore
  otherToday: DayScore
  /** Meilleure série en cours de chacun (s'il y en a une). */
  myBestStreak: StreakHighlight | null
  otherBestStreak: StreakHighlight | null
  isWeighInDay: boolean
  record: SeasonRecord
  /** Graine pour que la phrase ne change pas à chaque rendu (ex. le jour). */
  seed: DayKey
  /** Le duel n'a pas encore commencé (Season.notStarted). */
  notStarted?: boolean
  /** Ma pesée du jour est déjà faite (sinon, le jour J, on la rappelle). */
  myWeighInDone?: boolean
}

/** Réglages du choix des phrases du Ring. */
export const TAUNT_SETTINGS = {
  /** À partir de cette heure, rappel si mon check-in n'est pas fait. */
  eveningHour: 19,
  /** Une série 🔥 est mentionnée à partir de ce nombre de jours. */
  minStreakDays: 3,
  /** Revanche / titre à défendre : du lundi jusqu'à ce jour (3 = mercredi). */
  revengeUntilIsoDay: 3,
  /** Le bilan global est mentionné à partir de ce nombre de manches jouées. */
  recordMinPlayed: 2,
  /** Situations urgentes, par ordre de priorité. */
  urgent: ['notStarted', 'evening', 'weighin', 'otherPending'] as RingSituation[],
  /** Poids des autres situations dans le tirage. */
  weights: { day: 4, score: 4, revenge: 3, defend: 2, myStreak: 2, otherStreak: 2, record: 1 } as Partial<Record<RingSituation, number>>,
}

// ─── Outils ─────────────────────────────────────────────────────────────────

/** Hash 32 bits stable d'une chaîne (FNV-1a + mélange final). */
export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Tirage stable pondéré : même graine = même résultat. */
function pickWeighted<T>(items: { item: T; weight: number }[], seed: string): T | null {
  const total = items.reduce((sum, x) => sum + x.weight, 0)
  if (items.length === 0 || total <= 0) return null
  let r = hashString(seed) % total
  for (const x of items) {
    if (r < x.weight) return x.item
    r -= x.weight
  }
  return items[items.length - 1].item
}

type Vars = Record<string, string | number | null | undefined>

/** Remplit les {trous} ; `null` si un trou ne peut pas être rempli. */
export function fillTemplate(text: string, vars: Vars): string | null {
  let missing = false
  const out = text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = vars[key]
    if (v === null || v === undefined || v === '') {
      missing = true
      return match
    }
    return String(v)
  })
  return missing ? null : out
}

const NBSP = ' '

/** « 1 pt », « 40 pts ». */
export function formatPts(n: number): string {
  return `${n}${NBSP}${Math.abs(n) <= 1 ? 'pt' : 'pts'}`
}

function formatDays(n: number): string {
  return `${n}${NBSP}${Math.abs(n) <= 1 ? 'jour' : 'jours'}`
}

/** Écart : égalité, petit (< 30), moyen (30 à 100), gros (> 100). */
export function gapBucket(gap: number): GapBucket {
  const g = Math.abs(gap)
  if (g === 0) return 'tie'
  if (g < 30) return 'small'
  if (g <= 100) return 'medium'
  return 'large'
}

/** Moment de la manche selon le jour (1 = lundi … 7 = dimanche). */
export function dayBucket(isoDay: number): DayBucket {
  if (isoDay <= 1) return 'monday'
  if (isoDay <= 3) return 'midweek'
  if (isoDay === 4) return 'thursday'
  if (isoDay <= 6) return 'sprint'
  return 'sunday'
}

function oneOf<T>(cond: T | T[] | undefined, value: T): boolean {
  if (cond === undefined) return true
  return Array.isArray(cond) ? cond.includes(value) : cond === value
}

/** Choisit parmi des phrases candidates (déjà filtrées), pondérées par leur précision. */
function choose(candidates: { text: string | null; specificity: number }[], seed: string): string | null {
  const ok = candidates
    .filter((c): c is { text: string; specificity: number } => c.text !== null)
    .map((c) => ({ item: c.text, weight: 2 ** c.specificity }))
  return pickWeighted(ok, seed)
}

// ─── Ring ───────────────────────────────────────────────────────────────────

interface RingFacts {
  lead: Lead
  gap: GapBucket
  day: DayBucket
  hour: number
  recordLead: Lead
  winStreak: number
}

function ringFacts(ctx: RingTauntContext): RingFacts {
  const myWins = ctx.record.wins[ctx.me.id] ?? 0
  const otherWins = ctx.record.wins[ctx.other.id] ?? 0
  return {
    lead: ctx.myTotal > ctx.otherTotal ? 'me' : ctx.myTotal < ctx.otherTotal ? 'other' : 'tie',
    gap: gapBucket(ctx.myTotal - ctx.otherTotal),
    day: dayBucket(ctx.isoDay),
    hour: ctx.hour,
    recordLead: myWins > otherWins ? 'me' : myWins < otherWins ? 'other' : 'tie',
    winStreak: ctx.record.streak.playerId === ctx.me.id ? ctx.record.streak.count : 0,
  }
}

function ringPhraseMatches(p: RingPhrase, f: RingFacts): boolean {
  return (
    oneOf(p.lead, f.lead) &&
    oneOf(p.gap, f.gap) &&
    oneOf(p.day, f.day) &&
    oneOf(p.recordLead, f.recordLead) &&
    (p.minHour === undefined || f.hour >= p.minHour) &&
    (p.minWinStreak === undefined || f.winStreak >= p.minWinStreak)
  )
}

function ringSpecificity(p: RingPhrase): number {
  return [p.lead, p.gap, p.day, p.minHour, p.recordLead, p.minWinStreak].filter((c) => c !== undefined).length
}

/** Les situations du Ring qui s'appliquent, urgentes d'abord (dans l'ordre de priorité). */
export function activeRingSituations(ctx: RingTauntContext): RingSituation[] {
  const s = TAUNT_SETTINGS
  const streak = ctx.record.streak
  const earlyWeek = ctx.isoDay <= s.revengeUntilIsoDay
  const flags: Record<RingSituation, boolean> = {
    notStarted: ctx.notStarted === true,
    evening: ctx.hour >= s.eveningHour && ctx.myToday.total > 0 && !ctx.myToday.complete,
    weighin: ctx.isWeighInDay && ctx.myWeighInDone !== true,
    otherPending: ctx.myToday.complete && ctx.otherToday.total > 0 && !ctx.otherToday.complete,
    day: true,
    score: true,
    revenge: earlyWeek && streak.count > 0 && streak.playerId === ctx.other.id,
    defend: earlyWeek && streak.count > 0 && streak.playerId === ctx.me.id,
    myStreak: (ctx.myBestStreak?.days ?? 0) >= s.minStreakDays,
    otherStreak: (ctx.otherBestStreak?.days ?? 0) >= s.minStreakDays,
    record: ctx.record.played >= s.recordMinPlayed,
  }
  const urgent = s.urgent.filter((k) => flags[k])
  const others = (Object.keys(s.weights) as RingSituation[]).filter((k) => flags[k] && !s.urgent.includes(k))
  return [...urgent, ...others]
}

function ringVars(ctx: RingTauntContext, situation: RingSituation): Vars {
  const lead = ctx.myTotal > ctx.otherTotal ? ctx.me : ctx.myTotal < ctx.otherTotal ? ctx.other : null
  const trail = lead === null ? null : lead === ctx.me ? ctx.other : ctx.me
  const streak = situation === 'myStreak' ? ctx.myBestStreak : situation === 'otherStreak' ? ctx.otherBestStreak : null
  return {
    me: ctx.me.name,
    other: ctx.other.name,
    leader: lead?.name,
    trailer: trail?.name,
    gap: formatPts(Math.abs(ctx.myTotal - ctx.otherTotal)),
    myTotal: ctx.myTotal,
    otherTotal: ctx.otherTotal,
    daysLeft: formatDays(ctx.daysLeft),
    hour: ctx.hour,
    maxPoints: formatPts(RULES.weighIn.maxPoints),
    habit: streak?.habitName,
    emoji: streak?.emoji,
    days: streak?.days,
    myWins: ctx.record.wins[ctx.me.id] ?? 0,
    otherWins: ctx.record.wins[ctx.other.id] ?? 0,
    winStreak: ctx.record.streak.playerId === ctx.me.id ? ctx.record.streak.count : undefined,
  }
}

function ringLineFor(ctx: RingTauntContext, situation: RingSituation, facts: RingFacts): string | null {
  const vars = ringVars(ctx, situation)
  const candidates = RING_PHRASES[situation]
    .filter((p) => ringPhraseMatches(p, facts))
    .map((p) => ({ text: fillTemplate(p.text, vars), specificity: ringSpecificity(p) }))
  return choose(candidates, `${ctx.seed}|${ctx.me.id}|${situation}`)
}

/** Phrase taquine du Ring. */
export function pickRingTaunt(ctx: RingTauntContext): string {
  const facts = ringFacts(ctx)
  const active = activeRingSituations(ctx)
  const urgent = active.filter((s) => TAUNT_SETTINGS.urgent.includes(s))
  for (const situation of urgent) {
    const line = ringLineFor(ctx, situation, facts)
    if (line) return line
  }
  // Tirage stable (pondéré) d'une situation ; si elle n'a pas de phrase, on essaie les autres.
  const pool = active
    .filter((s) => !TAUNT_SETTINGS.urgent.includes(s))
    .map((s) => ({ item: s, weight: TAUNT_SETTINGS.weights[s] ?? 1 }))
  while (pool.length > 0) {
    const situation = pickWeighted(pool, `${ctx.seed}|${ctx.me.id}|situation`)!
    const line = ringLineFor(ctx, situation, facts)
    if (line) return line
    pool.splice(
      pool.findIndex((x) => x.item === situation),
      1,
    )
  }
  // Filet de sécurité (si quelqu'un vide les listes de phrases).
  if (facts.lead === 'tie') return 'Égalité parfaite. Ça sent la bagarre 🥊'
  const leader = facts.lead === 'me' ? ctx.me : ctx.other
  return `${leader.name} mène de ${formatPts(Math.abs(ctx.myTotal - ctx.otherTotal))} 😏`
}

// ─── Check-in ───────────────────────────────────────────────────────────────

/** Contexte de la phrase affichée après (ou pendant) le check-in. */
export interface CheckinLineContext {
  player: Player
  day: DayScore
  /** Réponses du jour, par habitude. */
  answers: { habitName: string; emoji: string; badgeKey: string | null; value: CheckinValue | null }[]
  seed: DayKey
}

/** État de la journée pour choisir la phrase du check-in. */
export function checkinState(ctx: Pick<CheckinLineContext, 'day' | 'answers'>): CheckinState {
  const values = ctx.answers.map((a) => a.value)
  const craquage = values.includes('craquage')
  if (!ctx.day.complete) {
    if (craquage) return 'craquage'
    return ctx.day.filled === 0 ? 'empty' : 'partial'
  }
  if (ctx.day.perfect) return 'perfect'
  if (craquage) return 'craquage'
  if (values.includes('pasfait')) return 'pasfait'
  return 'unpeu'
}

/** Les réponses concernées par l'état (réussies si parfait, ratées sinon). */
function concernedAnswers(state: CheckinState, answers: CheckinLineContext['answers']): CheckinLineContext['answers'] {
  switch (state) {
    case 'perfect':
      return answers.filter((a) => a.value === 'nickel' || a.value === 'fait')
    case 'craquage':
      return answers.filter((a) => a.value === 'craquage')
    case 'pasfait':
      return answers.filter((a) => a.value === 'pasfait')
    case 'unpeu':
      return answers.filter((a) => a.value === 'unpeu')
    default:
      return []
  }
}

/** Phrase de réaction au check-in (journée parfaite, craquage, en cours…). */
export function pickCheckinLine(ctx: CheckinLineContext): string {
  const state = checkinState(ctx)
  const concerned = concernedAnswers(state, ctx.answers)
  const featured = pickWeighted(
    concerned.map((a) => ({ item: a, weight: 1 })),
    `${ctx.seed}|${ctx.player.id}|${state}|habit`,
  )
  const base: Vars = {
    name: ctx.player.name,
    score: ctx.day.score,
    left: Math.max(0, ctx.day.total - ctx.day.filled),
  }
  const candidates = CHECKIN_PHRASES.filter((p) => p.state === state).map((p) => {
    const answer = p.habit ? concerned.find((a) => a.badgeKey === p.habit) : featured
    if (p.habit && !answer) return { text: null, specificity: 1 }
    return {
      text: fillTemplate(p.text, { ...base, habit: answer?.habitName, emoji: answer?.emoji }),
      specificity: p.habit ? 1 : 0,
    }
  })
  const line = choose(candidates, `${ctx.seed}|${ctx.player.id}|${state}|${concerned.map((a) => a.habitName).join(',')}`)
  if (line) return line
  if (state === 'perfect') return 'Journée parfaite ! 🎉'
  if (state === 'empty' || state === 'partial') return 'Encore un petit effort, tout se remplit en 15 secondes ⏱️'
  return 'Check-in bouclé ✅'
}

// ─── Pesée ──────────────────────────────────────────────────────────────────

/** Tranche de la réaction à une pesée. */
export function weighInBucket(changePct: number | null, points: number): WeighInBucket {
  const { maxPoints, fullPointsLossPct } = RULES.weighIn
  if (changePct === null) return 'start'
  if (points >= maxPoints) return changePct > -fullPointsLossPct + 1e-9 ? 'goal' : 'max'
  if (points >= 60) return 'great'
  if (points >= 30) return 'good'
  if (points > 0) return 'small'
  return 'zero'
}

/**
 * Réaction à une pesée (on parle de points et d'effort, jamais du corps).
 * `seed` (facultatif, ex. le jour) fait varier la phrase ; sans graine, la première.
 */
export function weighInReaction(changePct: number | null, points: number, seed?: string): { emoji: string; text: string } {
  const bucket = weighInBucket(changePct, points)
  const list = WEIGHIN_REACTIONS[bucket]
  const chosen = seed === undefined ? list[0] : pickWeighted(list.map((item) => ({ item, weight: 1 })), `${seed}|weighin|${bucket}`)
  const text = chosen ? fillTemplate(chosen.text, { points: formatPts(points) }) : null
  return chosen && text ? { emoji: chosen.emoji, text } : { emoji: '⚖️', text: `${formatPts(points)} pour la pesée` }
}

// ─── Résultats ──────────────────────────────────────────────────────────────

/** Infos en plus pour varier les phrases des résultats. */
export interface ResultsLineExtra {
  /** Écart final en points. */
  gap?: number
  /** Le gage de la manche. */
  stake?: string | null
}

/** Phrases de la cérémonie des résultats. */
export function resultsLine(
  kind: 'winner' | 'loser' | 'tie',
  winner: Player | null,
  loser: Player | null,
  seed: DayKey,
  extra: ResultsLineExtra = {},
): string {
  const gap = extra.gap === undefined ? null : gapBucket(extra.gap)
  const vars: Vars = {
    winner: winner?.name,
    loser: loser?.name,
    gap: extra.gap === undefined ? undefined : formatPts(Math.abs(extra.gap)),
    stake: extra.stake?.trim() || undefined,
  }
  const candidates = RESULTS_PHRASES.filter((p) => p.kind === kind)
    .filter((p) => p.gap === undefined || (gap !== null && gap !== 'tie' && oneOf(p.gap, gap)))
    .map((p) => ({ text: fillTemplate(p.text, vars), specificity: p.gap === undefined ? 0 : 1 }))
  const line = choose(candidates, `${seed}|results|${kind}`)
  if (line) return line
  if (kind === 'tie') return 'Égalité ! Gage pour les deux 🤝'
  if (kind === 'winner') return winner ? `${winner.name} remporte la manche 👑` : 'Victoire 👑'
  return loser ? `${loser.name}, c’est l’heure du gage 😭` : 'C’est l’heure du gage 😭'
}
