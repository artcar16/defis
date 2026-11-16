/**
 * Coque de l'app : « pas branchée » (production sans réglages Supabase), écran d'attente
 * (premier chargement), connexion, puis onglets, feuilles (pesée, résultats) et toasts temps
 * réel. En maquette, une pastille le rappelle en haut de chaque écran.
 */
import { AnimatePresence, PresenceContext, motion } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { pendingResultsWeek } from './core/season'
import { DuelProvider, useDuel } from './data/DuelProvider'
import { currentMode } from './data/env'
import { offlineHint } from './data/supabase/errors'
import { BadgesScreen } from './screens/BadgesScreen'
import { CheckinScreen } from './screens/CheckinScreen'
import { LoginScreen, ProblemBanner } from './screens/LoginScreen'
import { NotConnectedScreen } from './screens/NotConnectedScreen'
import { ResultsSheet } from './screens/ResultsSheet'
import { RingScreen } from './screens/RingScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SplashScreen } from './screens/SplashScreen'
import { StatsScreen } from './screens/StatsScreen'
import { WeighInSheet } from './screens/WeighInSheet'
import { onColor } from './ui/color'
import { DEMO_LABEL, DemoPill } from './ui/DemoPill'
import { SheetBannerContext } from './ui/kit'
import { NavProvider, useNav, type TabId } from './ui/nav'
import { TabBar } from './ui/TabBar'
import { ToastProvider, useToast } from './ui/toast'

const SCREENS: Record<TabId, () => React.JSX.Element> = {
  ring: RingScreen,
  checkin: CheckinScreen,
  stats: StatsScreen,
  badges: BadgesScreen,
  settings: SettingsScreen,
}

/** Variables de couleur des joueurs : couleur brute, et fond + encre lisibles d'un bouton. */
function playerVars(meColor: string, otherColor: string): Record<string, string> {
  const meBtn = onColor(meColor)
  const otherBtn = onColor(otherColor)
  return {
    '--me': meColor,
    '--other': otherColor,
    '--me-btn': meBtn.bg,
    '--me-ink': meBtn.ink,
    '--other-btn': otherBtn.bg,
    '--other-ink': otherBtn.ink,
  }
}

function Shell() {
  const { me, other, signedIn, loading, problem, season, snapshot, lastActivity, playerById, source, demo, backend } = useDuel()
  const { tab, setTab, sheet, openSheet, closeSheet } = useNav()
  const toast = useToast()

  // Toast quand l'adversaire fait quelque chose (temps réel). Jamais l'écho de mes propres actions.
  const lastShown = useRef(0)
  useEffect(() => {
    if (!lastActivity || lastActivity.at === lastShown.current) return
    lastShown.current = lastActivity.at
    if (lastActivity.playerId === me.id) return
    toast({ text: lastActivity.text, color: playerById(lastActivity.playerId).color })
  }, [lastActivity, toast, playerById, me.id])

  // La cérémonie des résultats s'ouvre toute seule à la première visite après la fin de la manche.
  // ResultsSheet la marque « vue » ; en attendant (écriture lente, hors ligne), on retient ici
  // les manches déjà ouvertes pour ne pas la rouvrir en boucle quand on la ferme.
  // Rien pendant le premier chargement : le snapshot de départ est vide.
  const pendingWeek = signedIn && !loading ? (pendingResultsWeek(season, snapshot.seenResults)?.weekStart ?? null) : null
  const autoOpened = useRef(new Set<string>())
  useEffect(() => {
    // Vue et confirmée par la source : on oublie (« Revoir la cérémonie » de la démo la rouvre).
    if (!pendingWeek) return autoOpened.current.clear()
    if (sheet) return
    const key = `${me.id}|${pendingWeek}`
    if (autoOpened.current.has(key)) return
    autoOpened.current.add(key)
    openSheet({ kind: 'results', weekStart: pendingWeek, auto: true })
  }, [pendingWeek, sheet, openSheet, me.id])

  // Au moment de se connecter, on arrive sur le Ring (pas sur l'onglet de la déconnexion).
  const wasSignedIn = useRef(signedIn)
  useEffect(() => {
    if (signedIn && !wasSignedIn.current) setTab('ring')
    wasSignedIn.current = signedIn
  }, [signedIn, setTab])

  const vars = playerVars(me.color, other.color) as CSSProperties
  // Aussi sur <html>, pour ce qui est rendu dans un portail (feuilles, célébrations).
  useEffect(() => {
    const root = document.documentElement.style
    for (const [name, value] of Object.entries(playerVars(me.color, other.color))) root.setProperty(name, value)
  }, [me.color, other.color])

  // Premier chargement (session, données) : écran d'attente, puis connexion ou Ring. Un
  // téléphone déjà connecté qui ne joint pas le serveur y reste, avec le problème et
  // « Réessayer » : il ne redemande pas le code.
  if (loading) {
    return (
      <div className="app-bg min-h-dvh text-ink" style={vars}>
        <SplashScreen
          problem={problem}
          detail={offlineHint(problem, backend.kind === 'supabase' ? backend.host : null)}
          onRetry={() => source.retry()}
        />
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className="app-bg min-h-dvh text-ink" style={vars}>
        <LoginScreen />
      </div>
    )
  }

  const Screen = SCREENS[tab]
  return (
    <div className="app-bg min-h-dvh text-ink" style={vars}>
      <main className="safe-top mx-auto max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+112px)]">
        {/* Maquette : on le dit en haut de chaque écran, pour ne jamais la prendre pour la vraie partie. */}
        {demo && <DemoPill className="pt-1" />}
        {/* Connecté mais bloqué (base pas à jour…) : on le dit, les données restent affichées. */}
        {problem && <ProblemBanner text={problem} className="mt-2 mb-2" />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {/* Contexte neutre : les animations d'entrée et les boucles de l'écran tournent
                normalement, y compris pour le premier écran affiché (initial={false} ci-dessus). */}
            <PresenceContext.Provider value={null}>
              <Screen />
            </PresenceContext.Provider>
          </motion.div>
        </AnimatePresence>
      </main>
      <TabBar />
      {/* Les feuilles couvrent tout l'écran : la pastille de la maquette y est aussi. */}
      <SheetBannerContext.Provider value={demo ? <DemoPill className="pt-1 pb-2" /> : null}>
        <WeighInSheet open={sheet?.kind === 'weighin'} onClose={closeSheet} />
        <ResultsSheet weekStart={sheet?.kind === 'results' ? sheet.weekStart : null} onClose={closeSheet} />
      </SheetBannerContext.Provider>
    </div>
  )
}

export default function App() {
  // Vraie base, maquette ou « pas branchée » : décidé une fois au démarrage (src/data/mode.ts).
  const [mode] = useState(currentMode)
  // En production sans réglages utilisables : jamais de maquette en silence, on dit quoi faire.
  if (mode.kind === 'unconfigured') return <NotConnectedScreen diagnosis={mode.diagnosis} />
  return (
    <DuelProvider mode={mode}>
      <NavProvider>
        {/* Maquette : chaque toast le rappelle (il se pose pile sur la pastille). */}
        <ToastProvider note={mode.kind === 'demo' ? `🧪 ${DEMO_LABEL}` : undefined}>
          <Shell />
        </ToastProvider>
      </NavProvider>
    </DuelProvider>
  )
}
