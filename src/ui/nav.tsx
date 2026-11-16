/**
 * Navigation : onglets du bas + feuilles plein écran (pesée, résultats).
 * L'onglet est reflété dans l'URL (#checkin, #stats…) pour pouvoir partager / tester un écran.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { DayKey } from '../core/types'

export type TabId = 'ring' | 'checkin' | 'stats' | 'badges' | 'settings'

export type SheetState =
  | { kind: 'weighin' }
  | { kind: 'results'; weekStart: DayKey; auto?: boolean }
  | null

/** `hash` = ancre d'URL de l'onglet (#reglages plutôt que #settings, réservé par certains hébergeurs). */
export const TABS: { id: TabId; label: string; emoji: string; hash: string }[] = [
  { id: 'ring', label: 'Ring', emoji: '🥊', hash: 'ring' },
  { id: 'checkin', label: 'Check-in', emoji: '✅', hash: 'checkin' },
  { id: 'stats', label: 'Stats', emoji: '📊', hash: 'stats' },
  { id: 'badges', label: 'Badges', emoji: '🏅', hash: 'badges' },
  { id: 'settings', label: 'Réglages', emoji: '⚙️', hash: 'reglages' },
]

interface NavValue {
  tab: TabId
  setTab: (tab: TabId) => void
  sheet: SheetState
  openSheet: (sheet: Exclude<SheetState, null>) => void
  closeSheet: () => void
}

const NavContext = createContext<NavValue | null>(null)

function tabFromHash(): TabId {
  const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : ''
  return TABS.find((t) => t.hash === h || t.id === h)?.id ?? 'ring'
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<TabId>(tabFromHash)
  const [sheet, setSheet] = useState<SheetState>(() =>
    typeof location !== 'undefined' && location.hash === '#pesee' ? { kind: 'weighin' } : null,
  )

  const setTab = useCallback((t: TabId) => {
    setTabState(t)
    try {
      history.replaceState(null, '', `#${TABS.find((x) => x.id === t)?.hash ?? t}`)
    } catch {
      // ignore (iframe sandboxée)
    }
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const openSheet = useCallback((s: Exclude<SheetState, null>) => setSheet(s), [])
  const closeSheet = useCallback(() => setSheet(null), [])

  return <NavContext.Provider value={{ tab, setTab, sheet, openSheet, closeSheet }}>{children}</NavContext.Provider>
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav doit être utilisé dans <NavProvider>')
  return ctx
}
