/**
 * Fournit les données du duel à toute l'app : snapshot, joueur connecté, saison
 * calculée, actions, et (en maquette) les commandes de démo.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dayKeyAt, hourAt } from '../core/dates'
import { buildSeason, type Season } from '../core/season'
import type { DayKey, DuelSnapshot, Player, PlayerId } from '../core/types'
import { DemoSource } from './demo/DemoSource'
import type { Activity, DemoControls, DuelSource } from './source'

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
  /** Commandes de la maquette (null en production). */
  demo: (DemoControls & { signIn(playerId: PlayerId): void; signedIn: boolean }) | null
  signedIn: boolean
  /** Dernière activité reçue (pour les toasts / animations). */
  lastActivity: (Activity & { at: number }) | null
}

const DuelContext = createContext<DuelContextValue | null>(null)

function createSource(): DemoSource {
  // Étape 5 : choisir SupabaseSource quand les clés sont présentes (et pas ?demo).
  return new DemoSource()
}

export function DuelProvider({ children }: { children: ReactNode }) {
  const [source] = useState(createSource)

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
    source.scheduleOtherCheckin()
    const tick = window.setInterval(() => setNow(source.now()), 60_000)
    return () => {
      unsubscribe()
      window.clearInterval(tick)
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

  const demo = useMemo<DuelContextValue['demo']>(
    () => ({
      switchPlayer: (id) => source.switchPlayer(id),
      simulateOtherCheckin: () => source.simulateOtherCheckin(),
      setToday: (d) => source.setToday(d),
      realToday: () => source.realToday(),
      replayResults: () => source.replayResults(),
      reset: () => source.reset(),
      signIn: (id) => source.signIn(id),
      get signedIn() {
        return source.signedIn
      },
    }),
    [source],
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
