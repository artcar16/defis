/**
 * Quels déblocages le joueur connecté n'a pas encore fêtés ?
 * Les célébrations vues sont gardées par la source (snapshot.seenBadges, markBadgesSeen) :
 * elles suivent le joueur d'un téléphone à l'autre, et « Remettre la démo à zéro » les efface.
 * Toute première visite (seenBadges vide) : les vieux déblocages sont marqués vus d'office
 * (voir firstVisitKeys dans model.ts).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BadgeState } from '../../core/badges'
import type { DayKey } from '../../core/types'
import { useDuel } from '../../data/DuelProvider'
import { firstVisitKeys, pendingUnlocks, unlockEvents } from './model'

export function useUnseenUnlocks(badges: BadgeState[], today: DayKey) {
  const { source, snapshot } = useDuel()
  const seenBadges = snapshot.seenBadges
  const events = useMemo(() => unlockEvents(badges), [badges])
  const firstVisit = seenBadges.length === 0

  // Première visite : on l'enregistre dans la source (idempotent, sans risque en StrictMode).
  useEffect(() => {
    if (!firstVisit) return
    source.markBadgesSeen(firstVisitKeys(events, today)).catch(() => {})
  }, [firstVisit, events, today, source])

  // Fêtés pendant cette visite : la cérémonie avance même si l'écriture échoue (hors ligne).
  // (L'écran est démonté à chaque changement d'onglet ou de joueur : pas besoin de clé par joueur.)
  const [dismissed, setDismissed] = useState<string[]>([])
  const pending = useMemo(
    () => pendingUnlocks(events, seenBadges, today).filter((e) => !dismissed.includes(e.key)),
    [events, seenBadges, today, dismissed],
  )

  const dismiss = useCallback(
    (key: string) => {
      setDismissed((keys) => [...keys, key])
      source.markBadgesSeen([key]).catch(() => {})
    },
    [source],
  )
  return { pending, dismiss }
}
