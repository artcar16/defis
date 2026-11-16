/**
 * Fournit les données du duel à toute l'app : snapshot, joueur connecté, saison
 * calculée, actions, et (en maquette) les commandes de démo.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { badgeUnlocksToRecord, computeBadges } from '../core/badges'
import { dayKeyAt, hourAt } from '../core/dates'
import { buildSeason, type Season } from '../core/season'
import type { DayKey, DuelSnapshot, Player, PlayerId } from '../core/types'
import { DemoSource } from './demo/DemoSource'
import type { DemoReason, Diagnosis, RunMode } from './mode'
import type { Activity, DemoControls, DuelSource } from './source'
import { projectHost } from './supabase/config'
import { createSupabaseSource } from './supabase/SupabaseSource'

/** Commandes de la maquette, telles que les écrans les voient. */
export type DemoContext = DemoControls & {
  /** Ancien nom de signInAs (« Jouer en tant que »). */
  signIn(playerId: PlayerId): void
  readonly signedIn: boolean
  /** Pourquoi la maquette : ?demo dans l'adresse, VITE_DEMO au build, ou dev sans .env. */
  readonly reason: DemoReason
  /** Ce qui manque pour brancher la vraie base (noms de variables seulement). */
  readonly diagnosis: Diagnosis
}

/** La base utilisée, à afficher (jamais la clé : seulement l'hôte du projet, public). */
export type Backend = { kind: 'supabase'; host: string } | { kind: 'demo'; reason: DemoReason }

export interface DuelContextValue {
  source: DuelSource
  snapshot: DuelSnapshot
  /** Heure actuelle (rafraîchie chaque minute ; la démo peut voyager dans le temps). */
  now: Date
  /** Aujourd'hui à Paris. */
  today: DayKey
  /** Heure à Paris (0-23). */
  hour: number
  me: Player
  other: Player
  playerById: (id: PlayerId) => Player
  season: Season
  /** Commandes de la maquette (null avec une vraie source). */
  demo: DemoContext | null
  /** Vraie base (et laquelle) ou maquette. */
  backend: Backend
  /** Premier chargement en cours : afficher l'écran d'attente. */
  loading: boolean
  /** Problème bloquant (en français, prêt à afficher), ou null. */
  problem: string | null
  signedIn: boolean
  /** Dernière activité reçue (pour les toasts / animations). */
  lastActivity: (Activity & { at: number }) | null
}

const DuelContext = createContext<DuelContextValue | null>(null)

/**
 * La vraie base ou la maquette, selon le mode (src/data/mode.ts). « Pas branchée » n'arrive
 * jamais ici : App affiche alors NotConnectedScreen sans monter DuelProvider.
 */
function createSource(mode: RunMode): DuelSource {
  return mode.kind === 'supabase' ? createSupabaseSource(mode.config.url, mode.config.key) : new DemoSource()
}

export function DuelProvider({ mode, children }: { mode: RunMode; children: ReactNode }) {
  const [source] = useState<DuelSource>(() => createSource(mode))

  const [snapshot, setSnapshot] = useState<DuelSnapshot>(() => source.getSnapshot())
  const [now, setNow] = useState<Date>(() => source.now())
  const [lastActivity, setLastActivity] = useState<DuelContextValue['lastActivity']>(null)
  const [signedIn, setSignedIn] = useState<boolean>(() => source.signedIn)
  const [loading, setLoading] = useState<boolean>(() => source.loading)
  const [problem, setProblem] = useState<string | null>(() => source.problem)

  useEffect(() => {
    const unsubscribe = source.subscribe((snap, activity) => {
      setSnapshot(snap)
      setNow(source.now())
      setSignedIn(source.signedIn)
      setLoading(source.loading)
      setProblem(source.problem)
      if (activity) setLastActivity({ ...activity, at: Date.now() })
    })
    if (source instanceof DemoSource) source.scheduleOtherCheckin()
    const tick = window.setInterval(() => setNow(source.now()), 60_000)
    return () => {
      unsubscribe()
      window.clearInterval(tick)
      source.dispose()
    }
  }, [source])

  const today = dayKeyAt(now)
  const season = useMemo(() => buildSeason(snapshot, today), [snapshot, today])
  const playerById = useCallback(
    (id: PlayerId) => snapshot.players.find((p) => p.id === id) ?? snapshot.players[0],
    [snapshot.players],
  )
  const me = playerById(snapshot.meId)
  const other = snapshot.players.find((p) => p.id !== snapshot.meId) ?? snapshot.players[1]

  // 🏅 Badges gravés (décision 16) : tout badge débloqué d'après le calcul est enregistré
  // par la source, pour ne plus le perdre après une correction. Pas de boucle : une fois
  // enregistré, badgeUnlocksToRecord ne le renvoie plus.
  useEffect(() => {
    // Rien tant que le premier chargement n'est pas fini (snapshot de départ, vide).
    if (!signedIn || loading) return
    const todo = badgeUnlocksToRecord(me.id, computeBadges(me.id, snapshot, season, today), snapshot.badgeUnlocks)
    if (todo.length > 0) source.recordBadgeUnlocks(todo).catch(() => {})
  }, [signedIn, loading, me.id, snapshot, season, today, source])

  const demo = useMemo<DemoContext | null>(() => {
    if (!(source instanceof DemoSource) || mode.kind !== 'demo') return null
    const d = source
    return {
      signInAs: (id) => d.signInAs(id),
      signIn: (id) => d.signInAs(id),
      travelDays: () => d.travelDays(),
      switchPlayer: (id) => d.switchPlayer(id),
      simulateOtherCheckin: () => d.simulateOtherCheckin(),
      setToday: (day) => d.setToday(day),
      realToday: () => d.realToday(),
      replayResults: () => d.replayResults(),
      reset: () => d.reset(),
      get signedIn() {
        return d.signedIn
      },
      reason: mode.reason,
      diagnosis: mode.diagnosis,
    }
  }, [source, mode])

  const backend = useMemo<Backend>(
    () => (mode.kind === 'supabase' ? { kind: 'supabase', host: projectHost(mode.config.url) } : { kind: 'demo', reason: mode.reason }),
    [mode],
  )

  const value: DuelContextValue = {
    source,
    snapshot,
    now,
    today,
    hour: hourAt(now),
    me,
    other,
    playerById,
    season,
    demo,
    backend,
    loading,
    problem,
    signedIn,
    lastActivity,
  }
  return <DuelContext.Provider value={value}>{children}</DuelContext.Provider>
}

/** Accès aux données du duel depuis n'importe quel composant. */
export function useDuel(): DuelContextValue {
  const ctx = useContext(DuelContext)
  if (!ctx) throw new Error('useDuel doit être utilisé dans <DuelProvider>')
  return ctx
}
