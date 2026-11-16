/**
 * 🏅 Badges, calculés à partir des données + des déblocages enregistrés. Module pur.
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
 * Seuls les jours jusqu'à aujourd'hui comptent, à partir du lundi de la première manche.
 * Un badge débloqué le reste (décision 13) : le calcul est fusionné avec
 * `snapshot.badgeUnlocks`. Sans cet enregistrement, une correction encore autorisée
 * (aujourd'hui, hier, pesée du jour) ferait disparaître un badge déjà fêté. La source
 * enregistre les nouveaux déblocages avec badgeUnlocksToRecord().
 */
import { RULES, type Rules } from '../config/rules'
import { addDays, isoDayName, weekDays, weekStartOf } from './dates'
import { canEditCheckin, checkinKey, isHabitActiveOn, playerWeekScore, type CheckinIndex } from './scoring'
import type { Season } from './season'
import { checkinJudge, habitJudge, scanStreak } from './streaks'
import type { BadgeHabitKey, BadgeUnlock, DayKey, DuelSnapshot, Habit, PlayerId } from './types'
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
  { id: 'remontada', emoji: '🚀', name: 'Remontada', description: `Gagner une manche en étant mené·e le ${isoDayName(B.comebackCheckDay)} soir` },
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
   * Chaque obtention, de la plus ancienne à la plus récente (unlockDays.length === count) :
   * le dernier jour de chaque bloc complet des séries (💅 🧘 🔒 📅 🔥), le jour du N-ième
   * « Fait » de chaque manche 🏋️, le dimanche de chaque manche 🚀 et de chaque triplé 👑,
   * le jour de chaque palier 🪶. Sert à lister les badges (re)gagnés pendant une manche.
   */
  unlockDays: DayKey[]
  /**
   * Progression vers le déblocage, ex. 4 / 7 (série en cours / objectif).
   * Débloqué : target / target. 🪶 Plume : en dixièmes de % de perte vers le
   * prochain palier (ex. 34 / 50 = −3,4 % sur −5 %), arrondi vers le bas.
   * `possible` (🏋️ Machine) : séances encore jouables dans la manche en cours, en plus de
   * `current` : jours à venir, aujourd'hui s'il n'est pas « Fait », hier s'il est resté vide
   * et encore rattrapable. Si target − current > possible : plus assez de jours.
   */
  progress: { current: number; target: number; possible?: number }
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
  /** Premier jour du duel : le lundi de la première manche (comme buildSeason). */
  from: DayKey
  /** Déblocages enregistrés pour ce joueur. */
  stored: BadgeUnlock[]
}

function earliest(a: DayKey | null, b: DayKey | null): DayKey | null {
  if (a === null) return b
  if (b === null) return a
  return a < b ? a : b
}

/** Jour enregistré de la première obtention d'un badge (ou d'un palier 🪶), s'il y en a un. */
function storedDay(ctx: BadgeContext, id: BadgeId, tier: number | null): DayKey | null {
  let day: DayKey | null = null
  for (const u of ctx.stored) if (u.badgeId === id && u.tier === tier) day = earliest(day, u.day)
  return day
}

/** Deux jours d'obtention désignent-ils la même ? (🏋️ : même manche ; sinon : même jour) */
function sameObtention(id: BadgeId, a: DayKey, b: DayKey): boolean {
  return id === 'machine' ? weekStartOf(a) === weekStartOf(b) : a === b
}

/**
 * Fusionne la première obtention enregistrée avec les obtentions calculées. Si elle
 * correspond à une obtention calculée, on garde le jour le plus ancien ; si elle a été
 * perdue après une correction autorisée (rien de calculé avant elle), elle compte quand même.
 */
function mergeStored(id: BadgeId, computed: DayKey[], stored: DayKey | null): DayKey[] {
  const days = [...computed]
  if (stored !== null) {
    const i = days.findIndex((d) => sameObtention(id, d, stored))
    if (i !== -1) days[i] = stored < days[i] ? stored : days[i]
    else if (days.every((d) => d > stored)) days.push(stored)
  }
  return days.sort()
}

/** Résultat d'un badge sans palier, fusionné avec le déblocage enregistré. */
function finish(ctx: BadgeContext, id: BadgeId, target: number, computed: DayKey[], current: number, possible?: number): BadgeResult {
  const unlockDays = mergeStored(id, computed, storedDay(ctx, id, null))
  const unlocked = unlockDays.length > 0
  return {
    applicable: true,
    unlocked,
    unlockedOn: unlockDays[0] ?? null,
    unlockDays,
    progress: {
      current: unlocked ? target : Math.max(0, Math.min(current, target)),
      target,
      ...(possible === undefined ? {} : { possible }),
    },
    count: unlockDays.length,
  }
}

/** Badge qui ne concerne pas ce joueur… sauf s'il l'a déjà obtenu (il le garde). */
function notApplicable(ctx: BadgeContext, id: BadgeId, target: number): BadgeResult {
  if (storedDay(ctx, id, null) !== null) return finish(ctx, id, target, [], 0)
  return { applicable: false, unlocked: false, unlockedOn: null, unlockDays: [], progress: { current: 0, target }, count: 0 }
}

/** Séries « Nickel » d'affilée sur une liste d'habitudes (le meilleur des habitudes). */
function streakBadge(ctx: BadgeContext, id: BadgeId, habits: Habit[], target: number): BadgeResult {
  if (habits.length === 0) return notApplicable(ctx, id, target)
  const days: DayKey[] = []
  let current = 0
  for (const h of habits) {
    const start = h.activeFrom > ctx.from ? h.activeFrom : ctx.from
    const scan = scanStreak(start, ctx.today, habitJudge(h, ctx.checkins), target)
    days.push(...scan.blockDays)
    current = Math.max(current, scan.current)
  }
  return finish(ctx, id, target, days, current)
}

function cleanStreak(ctx: BadgeContext, id: BadgeId, key: BadgeHabitKey): BadgeResult {
  return streakBadge(
    ctx,
    id,
    ctx.habits.filter((h) => h.badgeKey === key),
    ctx.rules.badges.cleanStreakDays,
  )
}

function machine(ctx: BadgeContext): BadgeResult {
  const target = ctx.rules.badges.sportDaysPerWeek
  const sport = ctx.habits.filter((h) => h.badgeKey === 'sport')
  if (sport.length === 0) return notApplicable(ctx, 'machine', target)
  const faitOn = (day: DayKey) =>
    sport.some((h) => isHabitActiveOn(h, day) && ctx.checkins.get(checkinKey(ctx.playerId, h.id, day))?.value === 'fait')
  const days: DayKey[] = []
  let current = 0
  for (const week of ctx.season.weeks) {
    let done = 0
    for (const day of weekDays(week.weekStart)) {
      if (day > ctx.today || day < ctx.from) continue
      if (faitOn(day)) {
        done++
        if (done === target) days.push(day)
      }
    }
    if (week.weekStart === ctx.season.current.weekStart) current = done
  }
  // Séances encore jouables dans la manche en cours (pas encore comptées dans `current`) :
  // les jours à venir, aujourd'hui s'il n'est pas déjà « Fait », et hier s'il est resté
  // vide et encore rattrapable (un oubli ; un « Pas fait » d'hier ne redevient pas une séance).
  const filledOn = (day: DayKey) =>
    sport.some((h) => isHabitActiveOn(h, day) && ctx.checkins.has(checkinKey(ctx.playerId, h.id, day)))
  let possible = 0
  for (const day of weekDays(ctx.season.current.weekStart)) {
    if (day < ctx.from || !sport.some((h) => isHabitActiveOn(h, day))) continue
    if (day > ctx.today) possible++
    else if (day === ctx.today) possible += faitOn(day) ? 0 : 1
    else if (canEditCheckin(day, ctx.today, ctx.snapshot.settings, ctx.rules) && !filledOn(day)) possible++
  }
  return finish(ctx, 'machine', target, days, current, possible)
}

function assidu(ctx: BadgeContext): BadgeResult {
  const target = ctx.rules.badges.assiduousDays
  const scan = scanStreak(ctx.from, ctx.today, checkinJudge(ctx.playerId, ctx.snapshot.habits, ctx.checkins), target)
  return finish(ctx, 'assidu', target, scan.blockDays, scan.current)
}

/** Petite tolérance pour les flottants (ex. −1,9999999 %). */
const EPS = 1e-9
/** Même chose, en dixièmes de % (−1,99999999 % → 20 dixièmes, pas 19). */
const TENTHS_EPS = 1e-6

function plume(ctx: BadgeContext): BadgeResult {
  const tiersPct = ctx.rules.badges.featherTiersPct
  const mine = weighInsOf(ctx.snapshot.weighIns, ctx.playerId).filter((w) => w.day <= ctx.today)
  const tiers: BadgeTier[] = tiersPct.map((pct) => ({
    label: formatPct(-pct, 0),
    pct,
    unlockedOn: earliest(mine.find((w) => w.fromStartPct <= -pct + EPS)?.day ?? null, storedDay(ctx, 'plume', pct)),
  }))
  const unlockDays = tiers.flatMap((t) => (t.unlockedOn === null ? [] : [t.unlockedOn])).sort()
  // Progression en dixièmes de % de perte depuis le départ, vers le prochain palier.
  // Arrondie vers le bas et plafonnée juste sous le palier : −4,98 % affiche 49 / 50, pas 50 / 50.
  const next = tiers.find((t) => t.unlockedOn === null)?.pct
  const latest = mine.at(-1)
  const lossTenths = latest ? Math.max(0, Math.floor(-latest.fromStartPct * 10 + TENTHS_EPS)) : 0
  const last = tiersPct[tiersPct.length - 1] ?? 0
  const progress =
    next === undefined
      ? { current: last * 10, target: last * 10 }
      : { current: Math.max(0, Math.min(lossTenths, next * 10 - 1)), target: next * 10 }
  return {
    applicable: true,
    unlocked: unlockDays.length > 0,
    unlockedOn: unlockDays[0] ?? null,
    unlockDays,
    progress,
    count: unlockDays.length,
    tiers,
  }
}

function remontada(ctx: BadgeContext): BadgeResult {
  const target = 1
  if (!ctx.otherId) return notApplicable(ctx, 'remontada', target)
  const checkDay = ctx.rules.badges.comebackCheckDay
  const days: DayKey[] = []
  for (const week of ctx.season.finished) {
    if (week.outcome.winnerId !== ctx.playerId || week.weekEnd > ctx.today) continue
    const upTo = addDays(week.weekStart, checkDay - 1)
    const mine = playerWeekScore(ctx.playerId, week.weekStart, ctx.season.data, ctx.rules, upTo).total
    const theirs = playerWeekScore(ctx.otherId, week.weekStart, ctx.season.data, ctx.rules, upTo).total
    if (mine < theirs) days.push(week.weekEnd)
  }
  return finish(ctx, 'remontada', target, days, 0)
}

function royale(ctx: BadgeContext): BadgeResult {
  const target = ctx.rules.badges.royalStreakWeeks
  let run = 0
  const days: DayKey[] = []
  for (const week of ctx.season.finished) {
    if (week.weekEnd > ctx.today) continue
    if (week.outcome.winnerId === ctx.playerId) {
      run++
      if (run % target === 0) days.push(week.weekEnd)
    } else {
      run = 0 // défaite ou égalité : la série repart de zéro
    }
  }
  return finish(ctx, 'royale', target, days, run)
}

function inarretable(ctx: BadgeContext): BadgeResult {
  return streakBadge(
    ctx,
    'inarretable',
    ctx.habits.filter((h) => h.kind === 'avoid'),
    ctx.rules.badges.unstoppableDays,
  )
}

const EVALUATORS: Record<BadgeId, (ctx: BadgeContext) => BadgeResult> = {
  manucure: (ctx) => cleanStreak(ctx, 'manucure', 'ongles'),
  zen: (ctx) => cleanStreak(ctx, 'zen', 'grattage'),
  frigo: (ctx) => cleanStreak(ctx, 'frigo', 'grignotage'),
  machine,
  assidu,
  plume,
  remontada,
  royale,
  inarretable,
}

/**
 * Calcule l'état de tous les badges d'un joueur : recalculé depuis les données, et
 * fusionné avec ses déblocages enregistrés (snapshot.badgeUnlocks) pour qu'un badge
 * débloqué le reste.
 */
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
    from: weekStartOf(snapshot.settings.seasonStart),
    stored: (snapshot.badgeUnlocks ?? []).filter((u) => u.playerId === playerId),
  }
  return BADGES.map((def) => ({ ...def, ...EVALUATORS[def.id](ctx) }))
}

/** Les badges débloqués exactement ce jour-là (pour l'animation de déblocage). */
export function badgesUnlockedOn(badges: BadgeState[], day: DayKey): BadgeState[] {
  return badges.filter((b) => b.unlocked && (b.unlockedOn === day || b.tiers?.some((t) => t.unlockedOn === day)))
}

/**
 * Déblocages à enregistrer : badges (et paliers 🪶) débloqués d'après `badges` (le
 * résultat de computeBadges pour `playerId`) mais pas encore dans `stored`. Un badge
 * n'est enregistré qu'une fois (sa première obtention ; un palier 🪶 = une ligne).
 * La source les enregistre (recordBadgeUnlocks) pour qu'ils ne se perdent plus.
 */
export function badgeUnlocksToRecord(playerId: PlayerId, badges: BadgeState[], stored: BadgeUnlock[]): BadgeUnlock[] {
  const has = (badgeId: string, tier: number | null) =>
    stored.some((u) => u.playerId === playerId && u.badgeId === badgeId && u.tier === tier)
  const out: BadgeUnlock[] = []
  for (const b of badges) {
    if (b.tiers) {
      for (const t of b.tiers) {
        if (t.unlockedOn && t.pct !== undefined && !has(b.id, t.pct)) out.push({ playerId, badgeId: b.id, tier: t.pct, day: t.unlockedOn })
      }
    } else if (b.unlocked && b.unlockedOn && !has(b.id, null)) {
      out.push({ playerId, badgeId: b.id, tier: null, day: b.unlockedOn })
    }
  }
  return out
}
