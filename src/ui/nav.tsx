/**
 * Navigation : onglets du bas + feuilles plein écran (pesée, résultats).
 * - L'onglet est reflété dans l'ancre d'URL (#checkin, #stats…) pour partager / tester un écran.
 *   Seules les ancres publiques sont lues (#ring #checkin #stats #badges #reglages), plus #pesee.
 * - Une feuille ouverte ajoute une entrée d'historique : le bouton retour (Android, navigateur)
 *   ferme la feuille au lieu de quitter l'app.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DayKey } from '../core/types'

export type TabId = 'ring' | 'checkin' | 'stats' | 'badges' | 'settings'

export type SheetState =
  | { kind: 'weighin' }
  | { kind: 'results'; weekStart: DayKey; auto?: boolean }
  | null

/** Jour demandé à l'ouverture du check-in (lien « Hier n'est pas complet » du Ring). */
export type CheckinDay = 'today' | 'yesterday'

export interface SetTabOptions {
  /** Ouvrir le check-in sur ce jour (lu une seule fois par l'écran, via takeCheckinDay). */
  checkinDay?: CheckinDay
  /** Faire défiler jusqu'à l'élément de cet id une fois l'onglet affiché (voir ANCHORS). */
  anchor?: string
}

/** `hash` = ancre d'URL de l'onglet (#reglages plutôt que #settings, réservé par certains hébergeurs). */
export const TABS: { id: TabId; label: string; emoji: string; hash: string }[] = [
  { id: 'ring', label: 'Ring', emoji: '🥊', hash: 'ring' },
  { id: 'checkin', label: 'Check-in', emoji: '✅', hash: 'checkin' },
  { id: 'stats', label: 'Stats', emoji: '📊', hash: 'stats' },
  { id: 'badges', label: 'Badges', emoji: '🏅', hash: 'badges' },
  { id: 'settings', label: 'Réglages', emoji: '⚙️', hash: 'reglages' },
]

/**
 * Ancres de sections, pour `setTab(tab, { anchor })` : l'écran pose `id={ANCHORS.x}` sur la section.
 * - stake : Réglages › Enjeu de la semaine
 * - proposals : Réglages › Propositions
 * - history : Stats › Historique des manches
 */
export const ANCHORS = { stake: 'enjeu', proposals: 'propositions', history: 'historique' } as const

/** Ancre qui ouvre la feuille Pesée au chargement. */
const WEIGHIN_HASH = 'pesee'

interface NavValue {
  tab: TabId
  setTab: (tab: TabId, opts?: SetTabOptions) => void
  /** Jour demandé pour le check-in par le dernier setTab, puis oublié (null si rien). */
  takeCheckinDay: () => CheckinDay | null
  sheet: SheetState
  openSheet: (sheet: Exclude<SheetState, null>) => void
  closeSheet: () => void
}

const NavContext = createContext<NavValue | null>(null)

/** Marque nos entrées d'historique : { duelSheet: la feuille ouverte }. */
interface SheetHistoryState {
  duelSheet: Exclude<SheetState, null>
}

function currentHash(): string {
  try {
    return typeof location === 'undefined' ? '' : location.hash.replace(/^#/, '')
  } catch {
    return ''
  }
}

function hashOf(tab: TabId): string {
  return `#${TABS.find((x) => x.id === tab)?.hash ?? 'ring'}`
}

/** Seules les ancres publiques comptent : #settings (réservé par certains hôtes) est ignoré. */
function tabOfHash(h: string): TabId | null {
  return TABS.find((t) => t.hash === h)?.id ?? null
}

function sheetInHistory(): Exclude<SheetState, null> | null {
  try {
    return (history.state as Partial<SheetHistoryState> | null)?.duelSheet ?? null
  } catch {
    return null
  }
}

/** history.* peut être interdit (cadre sandboxé) : on ne bloque jamais l'app pour ça. */
function tryHistory(fn: () => void): boolean {
  try {
    fn()
    return true
  } catch {
    return false
  }
}

function prefersReducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Hauteur de l'encoche (safe area du haut), en px. */
function safeAreaTop(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)'
  document.body.appendChild(probe)
  const h = probe.getBoundingClientRect().height
  probe.remove()
  return h
}

/** Position de l'élément dans la page, sans les transformations (animations d'entrée en cours). */
function layoutTop(el: HTMLElement): number {
  let top = 0
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop
  return top
}

/** Attend que l'élément existe (≈ 1,5 s max), puis le fait défiler en haut de l'écran, sous l'encoche. */
function scrollToAnchor(id: string): () => void {
  const started = performance.now()
  let frame = 0
  let settle: number | undefined
  const step = () => {
    const el = document.getElementById(id)
    if (el) {
      // Un court instant : l'écran vient d'apparaître, sa mise en page se pose.
      settle = window.setTimeout(() => {
        const margin = Math.max(parseFloat(getComputedStyle(el).scrollMarginTop) || 0, safeAreaTop() + 12)
        window.scrollTo({ top: Math.max(0, layoutTop(el) - margin), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }, 80)
      return
    }
    if (performance.now() - started < 1500) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
  return () => {
    cancelAnimationFrame(frame)
    window.clearTimeout(settle)
  }
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [initialHash] = useState(currentHash)
  const [tab, setTabState] = useState<TabId>(() => tabOfHash(initialHash) ?? 'ring')
  const [sheet, setSheet] = useState<SheetState>(() => (initialHash === WEIGHIN_HASH ? { kind: 'weighin' } : null))

  const tabRef = useRef(tab)
  const checkinDay = useRef<CheckinDay | null>(null)
  /** On a demandé history.back() pour fermer une feuille : le popstate qui suit est le nôtre. */
  const closing = useRef(false)
  /** Ancre d'onglet à écrire une fois ce retour terminé (sinon on écrirait sur l'entrée de la feuille). */
  const pendingHash = useRef<string | null>(null)
  const cancelScroll = useRef<() => void>(() => {})

  const writeTabHash = useCallback((hash: string) => {
    if (closing.current) {
      pendingHash.current = hash
      return
    }
    tryHistory(() => history.replaceState(history.state, '', hash))
  }, [])

  const finishClosing = useCallback(() => {
    if (!closing.current) return
    closing.current = false
    const h = pendingHash.current
    pendingHash.current = null
    if (h) tryHistory(() => history.replaceState(history.state, '', h))
  }, [])

  const setTab = useCallback(
    (t: TabId, opts: SetTabOptions = {}) => {
      setTabState(t)
      tabRef.current = t
      checkinDay.current = opts.checkinDay ?? null
      writeTabHash(hashOf(t))
      cancelScroll.current()
      cancelScroll.current = () => {}
      if (opts.anchor) cancelScroll.current = scrollToAnchor(opts.anchor)
      else window.scrollTo({ top: 0 })
    },
    [writeTabHash],
  )

  const takeCheckinDay = useCallback(() => {
    const d = checkinDay.current
    checkinDay.current = null
    return d
  }, [])

  const openSheet = useCallback((s: Exclude<SheetState, null>) => {
    setSheet(s)
    // Une seule entrée par feuille : si la nôtre est déjà au sommet (double appel), on la remplace.
    tryHistory(() => {
      const state: SheetHistoryState = { duelSheet: s }
      if (sheetInHistory()) history.replaceState(state, '', location.href)
      else history.pushState(state, '', location.href)
    })
  }, [])

  const closeSheet = useCallback(() => {
    setSheet(null)
    if (sheetInHistory()) {
      // L'entrée est la nôtre : on la dépile (le popstate qui suit ne fait rien de plus).
      closing.current = true
      if (!tryHistory(() => history.back())) finishClosing()
      // Filet de sécurité si le popstate n'arrive jamais (cadre).
      else window.setTimeout(finishClosing, 1000)
      return
    }
    // Feuille ouverte par #pesee (ou entrée perdue) : on remet l'ancre de l'onglet.
    if (currentHash() !== hashOf(tabRef.current).slice(1)) writeTabHash(hashOf(tabRef.current))
  }, [finishClosing, writeTabHash])

  // Feuille ouverte par #pesee au chargement : l'URL reprend l'ancre de l'onglet, et la
  // feuille a sa propre entrée par-dessus (retour = fermer la feuille, pas quitter l'app).
  useEffect(() => {
    if (initialHash !== WEIGHIN_HASH || sheetInHistory()) return
    tryHistory(() => {
      history.replaceState(null, '', hashOf(tabRef.current))
      history.pushState({ duelSheet: { kind: 'weighin' } } satisfies SheetHistoryState, '', `#${WEIGHIN_HASH}`)
    })
  }, [initialHash])

  useEffect(() => {
    const onPop = () => {
      if (closing.current) return finishClosing()
      // Retour (ou avance) de l'utilisateur : la feuille suit l'entrée d'historique.
      setSheet(sheetInHistory())
    }
    const onHash = () => {
      const h = currentHash()
      const t = tabOfHash(h)
      if (t) {
        setTabState(t)
        tabRef.current = t
      } else if (h === WEIGHIN_HASH) {
        // #pesee tapé à la main : la navigation a déjà créé l'entrée, on la marque comme nôtre.
        const s: Exclude<SheetState, null> = { kind: 'weighin' }
        setSheet(s)
        tryHistory(() => history.replaceState({ duelSheet: s } satisfies SheetHistoryState, '', location.href))
      }
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onHash)
      cancelScroll.current()
    }
  }, [finishClosing])

  const value = useMemo(
    () => ({ tab, setTab, takeCheckinDay, sheet, openSheet, closeSheet }),
    [tab, setTab, takeCheckinDay, sheet, openSheet, closeSheet],
  )
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav doit être utilisé dans <NavProvider>')
  return ctx
}
