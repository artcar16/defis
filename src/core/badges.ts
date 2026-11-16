/**
 * 🏅 Badges, calculés à partir des données (rien n'est stocké). Module pur.
 *
 * Règles (tableau « Badges » + décision 13 de SPEC.md, seuils dans RULES.badges) :
 * - 💅 🧘 🔒 : N jours d'affilée « 😇 Nickel » sur l'habitude du joueur qui porte
 *   ce badgeKey (ongles / grattage / grignotage). Un jour passé non rempli casse
 *   la série, les jours où l'habitude est inactive sont ignorés.
 * - 🏋️ Machine : au moins N « 💪 Fait » sur l'habitude sport dans une même manche.
 * - 📅 Assidu·e : N jours d'affilée avec un check-in complet.
 * - 🪶 Plume : paliers de perte depuis la première pesée (−2 %, −5 %, −10 %).
 * - 🚀 Remontada : gagner une manche terminée en étant strictement mené·e au
 *   total le jeudi soir.
 * - 👑 Série royale : N manches terminées gagnées d'affilée (une égalité casse la série).
 * - 🔥 Inarrêtable : N jours d'affilée « Nickel » sur une même habitude à éviter.
 *
 * Seuls les jours jusqu'à aujourd'hui comptent. Un badge débloqué le reste : tout
 * est recalculé depuis l'historique, qui ne change plus une fois la manche close.
 */
import { RULES, type Rules } from '../config/rules'
import { addDays, weekDays } from './dates'
import { checkinKey, isHabitActiveOn, playerWeekScore, type CheckinIndex } from './scoring'
import type { Season } from './season'
import { checkinJudge, habitJudge, scanStreak } from './streaks'
import type { BadgeHabitKey, DayKey, DuelSnapshot, Habit, PlayerId } from './types'
import { formatPct, weighInsOf } from './weight'

export type BadgeId =
  | 'manucure'
  | 'zen'
  | 'frigo'
  | 'machine'
  | 'assidu'
  | 'plume'
  | 'remontada'
  | 'royale'
  | 'inarretable'

export interface BadgeDef {
  id: BadgeId
  emoji: string
  name: string
  /** Condition, en français, affichée dans la galerie. */
  description: string
}

const B = RULES.badges

/** « −2 % depuis le départ, puis −5 % et −10 % ». */
function featherDescription(tiers: readonly number[]): string {
  const [first, ...rest] = tiers.map((t) => formatPct(-t, 0))
  if (!first) return 'Perdre un peu depuis le départ'
  if (rest.length === 0) return `${first} depuis le départ`
  const last = rest.pop()
  return `${first} depuis le départ, puis ${rest.length ? `${rest.join(', ')} et ` : ''}${last}`
}

export const BADGES: BadgeDef[] = [
  { id: 'manucure', emoji: '💅', name: 'Manucure intacte', description: `${B.cleanStreakDays} jours d’affilée sans se ronger les ongles` },
  { id: 'zen', emoji: '🧘', name: 'Zen absolu', description: `${B.cleanStreakDays} jours d’affilée sans se gratter` },
  { id: 'frigo', emoji: '🔒', name: 'Frigo fermé', description: `${B.cleanStreakDays} jours d’affilée sans grignoter` },
  { id: 'machine', emoji: '🏋️', name: 'Machine', description: `Sport ${B.sportDaysPerWeek} jours dans la même semaine` },
  { id: 'assidu', emoji: '📅', name: 'Assidu·e', description: `Check-in complet ${B.assiduousDays} jours d’affilée` },
  { id: 'plume', emoji: '🪶', name: 'Plume', description: featherDescription(B.featherTiersPct) },
  { id: 'remontada', emoji: '🚀', name: 'Remontada', description: 'Gagner une manche en étant mené·e le jeudi soir' },
  { id: 'royale', emoji: '👑', name: 'Série royale', description: `${B.royalStreakWeeks} manches gagnées d’affilée` },
  { id: 'inarretable', emoji: '🔥', name: 'Inarrêtable', description: `${B.unstoppableDays} jours d’affilée « nickel » sur une même habitude à éviter` },
]

export interface BadgeTier {
  /** Ex. « −2 % ». */
  label: string
  unlockedOn: DayKey | null
  /** Le palier en % de perte depuis le départ (ex. 2 pour −2 %). */
  pct?: number
}

export interface BadgeState extends BadgeDef {
  /** Le badge concerne-t-il ce joueur ? (ex. 🧘 Zen absolu sans habitude « grattage » → non) */
  applicable: boolean
  unlocked: boolean
  /** Premier jour où la condition a été remplie (pour les manches : le dimanche de la manche). */
  unlockedOn: DayKey | null
  /**
   * Progression vers le déblocage, ex. 4 / 7 (série en cours / objectif).
   * Débloqué : target / target. 🪶 Plume : en dixièmes de % de perte vers le
   * prochain palier (ex. 34 / 50 = −3,4 % sur −5 %).
   */
  progress: { current: number; target: number }
  /** Paliers (🪶 Plume uniquement). */
  tiers?: BadgeTier[]
  /**
   * Nombre de fois obtenu : séries complètes (14 jours = 2 × 7), manches pour
   * 🏋️ / 🚀, paliers pour 🪶, triplés pour 👑.
   */
  count: number
}

type BadgeResult = Omit<BadgeState, keyof BadgeDef>

interface BadgeContext {
  playerId: PlayerId
  otherId: PlayerId | null
  snapshot: DuelSnapshot
  season: Season
  today: DayKey
  rules: Rules
  /** Toutes les habitudes du joueur (actives ou non : un badge débloqué le reste). */
  habits: Habit[]
  checkins: CheckinIndex
  /** Premier jour du duel. */
  from: DayKey
}

function notApplicable(target: number): BadgeResult {
  return { applicable: false, unlocked: false, unlockedOn: null, progress: { current: 0, target }, count: 0 }
}

function result(target: number, unlockedOn: DayKey | null, current: number, count: number): BadgeResult {
  const unlocked = unlockedOn !== null
  return {
    applicable: true,
    unlocked,
    unlockedOn,
    progress: { current: unlocked ? target : Math.max(0, Math.min(current, target)), target },
    count,
  }
}

function earliest(a: DayKey | null, b: DayKey | null): DayKey | null {
  if (a === null) return b
  if (b === null) return a
  return a < b ? a : b
}

/** Séries « Nickel » d'affilée sur une liste d'habitudes (le meilleur des habitudes). */
function streakBadge(ctx: BadgeContext, habits: Habit[], target: number): BadgeResult {
  if (habits.length === 0) return notApplicable(target)
  let unlockedOn: DayKey | null = null
  let current = 0
  let count = 0
  for (const h of habits) {
    const start = h.activeFrom > ctx.from ? h.activeFrom : ctx.from
    const scan = scanStreak(start, ctx.today, habitJudge(h, ctx.checkins), target)
    unlockedOn = earliest(unlockedOn, scan.reachedOn)
    current = Math.max(current, scan.current)
    count += scan.blocks
  }
  return result(target, unlockedOn, current, count)
}

function cleanStreak(ctx: BadgeContext, key: BadgeHabitKey): BadgeResult {
  return streakBadge(
    ctx,
    ctx.habits.filter((h) => h.badgeKey === key),
    ctx.rules.badges.cleanStreakDays,
  )
}

function machine(ctx: BadgeContext): BadgeResult {
  const target = ctx.rules.badges.sportDaysPerWeek
  const sport = ctx.habits.filter((h) => h.badgeKey === 'sport')
  if (sport.length === 0) return notApplicable(target)
  let unlockedOn: DayKey | null = null
  let count = 0
  let current = 0
  for (const week of ctx.season.weeks) {
    let done = 0
    let reached: DayKey | null = null
    for (const day of weekDays(week.weekStart)) {
      if (day > ctx.today || day < ctx.from) continue
      const fait = sport.some(
        (h) => isHabitActiveOn(h, day) && ctx.checkins.get(checkinKey(ctx.playerId, h.id, day))?.value === 'fait',
      )
      if (fait) {
        done++
        if (done === target) reached = day
      }
    }
    if (reached) {
      count++
      unlockedOn = earliest(unlockedOn, reached)
    }
    if (week.weekStart === ctx.season.current.weekStart) current = done
  }
  return result(target, unlockedOn, current, count)
}

function assidu(ctx: BadgeContext): BadgeResult {
  const target = ctx.rules.badges.assiduousDays
  const scan = scanStreak(ctx.from, ctx.today, checkinJudge(ctx.playerId, ctx.snapshot.habits, ctx.checkins), target)
  return result(target, scan.reachedOn, scan.current, scan.blocks)
}

/** Petite tolérance pour les flottants (ex. −1,9999999 %). */
const EPS = 1e-9

function plume(ctx: BadgeContext): BadgeResult {
  const tiersPct = ctx.rules.badges.featherTiersPct
  const mine = weighInsOf(ctx.snapshot.weighIns, ctx.playerId).filter((w) => w.day <= ctx.today)
  const tiers: BadgeTier[] = tiersPct.map((pct) => ({
    label: formatPct(-pct, 0),
    pct,
    unlockedOn: mine.find((w) => w.fromStartPct <= -pct + EPS)?.day ?? null,
  }))
  const reached = tiers.filter((t) => t.unlockedOn !== null).length
  const unlockedOn = tiers[0]?.unlockedOn ?? null
  // Progression en dixièmes de % de perte depuis le départ, vers le prochain palier.
  const next = tiersPct.find((_, i) => tiers[i].unlockedOn === null)
  const latest = mine.at(-1)
  const lossTenths = latest ? Math.max(0, Math.round(-latest.fromStartPct * 10)) : 0
  const last = tiersPct[tiersPct.length - 1] ?? 0
  const progress =
    next === undefined
      ? { current: last * 10, target: last * 10 }
      : { current: Math.min(lossTenths, next * 10), target: next * 10 }
  return { applicable: true, unlocked: unlockedOn !== null, unlockedOn, progress, count: reached, tiers }
}

function remontada(ctx: BadgeContext): BadgeResult {
  const target = 1
  if (!ctx.otherId) return notApplicable(target)
  const checkDay = ctx.rules.badges.comebackCheckDay
  let unlockedOn: DayKey | null = null
  let count = 0
  for (const week of ctx.season.finished) {
    if (week.outcome.winnerId !== ctx.playerId || week.weekEnd > ctx.today) continue
    const upTo = addDays(week.weekStart, checkDay - 1)
    const mine = playerWeekScore(ctx.playerId, week.weekStart, ctx.season.data, ctx.rules, upTo).total
    const theirs = playerWeekScore(ctx.otherId, week.weekStart, ctx.season.data, ctx.rules, upTo).total
    if (mine < theirs) {
      count++
      unlockedOn = earliest(unlockedOn, week.weekEnd)
    }
  }
  return result(target, unlockedOn, 0, count)
}

function royale(ctx: BadgeContext): BadgeResult {
  const target = ctx.rules.badges.royalStreakWeeks
  let run = 0
  let unlockedOn: DayKey | null = null
  let count = 0
  for (const week of ctx.season.finished) {
    if (week.weekEnd > ctx.today) continue
    if (week.outcome.winnerId === ctx.playerId) {
      run++
      if (run % target === 0) {
        count++
        unlockedOn = earliest(unlockedOn, week.weekEnd)
      }
    } else {
      run = 0 // défaite ou égalité : la série repart de zéro
    }
  }
  return result(target, unlockedOn, run, count)
}

function inarretable(ctx: BadgeContext): BadgeResult {
  return streakBadge(
    ctx,
    ctx.habits.filter((h) => h.kind === 'avoid'),
    ctx.rules.badges.unstoppableDays,
  )
}

const EVALUATORS: Record<BadgeId, (ctx: BadgeContext) => BadgeResult> = {
  manucure: (ctx) => cleanStreak(ctx, 'ongles'),
  zen: (ctx) => cleanStreak(ctx, 'grattage'),
  frigo: (ctx) => cleanStreak(ctx, 'grignotage'),
  machine,
  assidu,
  plume,
  remontada,
  royale,
  inarretable,
}

/** Calcule l'état de tous les badges d'un joueur. */
export function computeBadges(
  playerId: PlayerId,
  snapshot: DuelSnapshot,
  season: Season,
  today: DayKey,
  rules: Rules = RULES,
): BadgeState[] {
  const ctx: BadgeContext = {
    playerId,
    otherId: snapshot.players.find((p) => p.id !== playerId)?.id ?? null,
    snapshot,
    season,
    today,
    rules,
    habits: snapshot.habits.filter((h) => h.playerId === playerId),
    checkins: season.data.checkins,
    from: snapshot.settings.seasonStart,
  }
  return BADGES.map((def) => ({ ...def, ...EVALUATORS[def.id](ctx) }))
}

/** Les badges débloqués exactement ce jour-là (pour l'animation de déblocage). */
export function badgesUnlockedOn(badges: BadgeState[], day: DayKey): BadgeState[] {
  return badges.filter((b) => b.unlocked && (b.unlockedOn === day || b.tiers?.some((t) => t.unlockedOn === day)))
}
