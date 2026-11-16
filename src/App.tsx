/**
 * Coque de l'app : onglets, feuilles (pesée, résultats), toasts temps réel.
 */
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { pendingResultsWeek } from './core/season'
import { DuelProvider, useDuel } from './data/DuelProvider'
import { BadgesScreen } from './screens/BadgesScreen'
import { CheckinScreen } from './screens/CheckinScreen'
import { LoginScreen } from './screens/LoginScreen'
import { ResultsSheet } from './screens/ResultsSheet'
import { RingScreen } from './screens/RingScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { StatsScreen } from './screens/StatsScreen'
import { WeighInSheet } from './screens/WeighInSheet'
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

function Shell() {
  const { me, other, signedIn, season, snapshot, lastActivity, playerById } = useDuel()
  const { tab, sheet, openSheet, closeSheet } = useNav()
  const toast = useToast()

  // Toast quand l'adversaire fait quelque chose (temps réel).
  const lastShown = useRef(0)
  useEffect(() => {
    if (!lastActivity || lastActivity.at === lastShown.current) return
    lastShown.current = lastActivity.at
    toast({ text: lastActivity.text, color: playerById(lastActivity.playerId).color })
  }, [lastActivity, toast, playerById])

  // La cérémonie des résultats s'ouvre toute seule à la première visite après la fin de la manche.
  // (ResultsSheet la marque « vue » dès son ouverture, donc elle ne se rouvre pas.)
  const pendingWeek = signedIn ? (pendingResultsWeek(season, snapshot.seenResults)?.weekStart ?? null) : null
  useEffect(() => {
    if (pendingWeek && !sheet) openSheet({ kind: 'results', weekStart: pendingWeek, auto: true })
  }, [pendingWeek, sheet, openSheet])

  const vars = { ['--me' as string]: me.color, ['--other' as string]: other.color } as CSSProperties

  if (!signedIn) {
    return (
      <div className="app-bg min-h-dvh" style={vars}>
        <LoginScreen />
      </div>
    )
  }

  const Screen = SCREENS[tab]
  return (
    <div className="app-bg min-h-dvh text-ink" style={vars}>
      <main className="safe-top mx-auto max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+112px)]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <Screen />
          </motion.div>
        </AnimatePresence>
      </main>
      <TabBar />
      <WeighInSheet open={sheet?.kind === 'weighin'} onClose={closeSheet} />
      <ResultsSheet weekStart={sheet?.kind === 'results' ? sheet.weekStart : null} onClose={closeSheet} />
    </div>
  )
}

export default function App() {
  return (
    <DuelProvider>
      <NavProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </NavProvider>
    </DuelProvider>
  )
}
