/**
 * Quels déblocages le joueur n'a pas encore fêtés ?
 * Les clés vues sont gardées dans localStorage ('duel-badges-seen-<playerId>'),
 * avec une copie en mémoire si le stockage est indisponible (navigation privée…).
 * Première visite : les déblocages de plus de GRACE_DAYS jours sont considérés
 * comme vus, pour ne pas enchaîner dix cérémonies d'un coup.
 */
import { useCallback, useMemo, useReducer } from 'react'
import type { BadgeState } from '../../core/badges'
import { diffDays } from '../../core/dates'
import type { DayKey, PlayerId } from '../../core/types'
import { unlockEvents, type UnlockEvent } from './model'

const STORAGE_PREFIX = 'duel-badges-seen-'
const GRACE_DAYS = 3

/** Copie en mémoire (une lecture du stockage par joueur et par session). */
const memory = new Map<PlayerId, Set<string>>()

function readStored(playerId: PlayerId): Set<string> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + playerId)
    if (raw === null) return null
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? new Set(list.filter((x): x is string => typeof x === 'string')) : null
  } catch {
    return null
  }
}

function writeStored(playerId: PlayerId, keys: Set<string>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + playerId, JSON.stringify([...keys]))
  } catch {
    // Stockage indisponible : la copie en mémoire suffit pour cette session.
  }
}

function seenKeys(playerId: PlayerId, events: UnlockEvent[], today: DayKey): Set<string> {
  const cached = memory.get(playerId)
  if (cached) return cached
  let keys = readStored(playerId)
  if (keys === null) {
    keys = new Set(events.filter((e) => diffDays(e.on, today) > GRACE_DAYS).map((e) => e.key))
    writeStored(playerId, keys)
  }
  memory.set(playerId, keys)
  return keys
}

function markSeen(playerId: PlayerId, key: string) {
  const keys = memory.get(playerId) ?? readStored(playerId) ?? new Set<string>()
  keys.add(key)
  memory.set(playerId, keys)
  writeStored(playerId, keys)
}

export function useUnseenUnlocks(playerId: PlayerId, badges: BadgeState[], today: DayKey) {
  const events = useMemo(() => unlockEvents(badges), [badges])
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const seen = seenKeys(playerId, events, today)
  const pending = events.filter((e) => !seen.has(e.key))
  const dismiss = useCallback(
    (key: string) => {
      markSeen(playerId, key)
      rerender()
    },
    [playerId],
  )
  return { pending, dismiss }
}
