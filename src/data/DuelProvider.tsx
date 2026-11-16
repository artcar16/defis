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
import type { Activity, DemoControls, DuelSource } from './source'

/** Commandes de la maquette, telles que les écrans les voient. */
export type DemoContext = DemoControls & {
  /** Ancien nom de signInAs (« Jouer en tant que »). */
  signIn(playerId: PlayerId): void
  readonly signedIn: boolean
}

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
  signedIn: boolean
  /** Dernière activité reçue (pour les toasts / animations). */
  lastActivity: (Activity & { at: number }) | null
}

const DuelContext = createContext<DuelContextValue | null>(null)

function createSource(): DuelSource {
  // Étape 5 : choisir SupabaseSource quand les clés sont présentes (et pas ?demo).
  return new DemoSource()
}

export function DuelProvider({ children }: { children: ReactNode }) {
  const [source] = useState<DuelSource>(createSource)

  const [snapshot, setSnapshot] = useState<DuelSnapshot>(() => source.getSnapshot())
  const [now, setNow] = useState<Date>(() => source.now())
  const [lastActivity, setLastActivity] = useState<DuelContextValue['lastActivity']>(null)
  const [signedIn, setSignedIn] = useState<boolean>(() => source.signedIn)

  useEffect(() => {
    const unsubscribe = source.subscribe((snap, activity) => {
      setSnapshot(snap)
      setNow(source.now())
      setSignedIn(source.signedIn)
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
    if (!signedIn) return
    const todo = badgeUnlocksToRecord(me.id, computeBadges(me.id, snapshot, season, today), snapshot.badgeUnlocks)
    if (todo.length > 0) source.recordBadgeUnlocks(todo).catch(() => {})
  }, [signedIn, me.id, snapshot, season, today, source])

  const demo = useMemo<DemoContext | null>(() => {
    if (!(source instanceof DemoSource)) return null
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
    }
  }, [source])

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
