/**
 * 🏆 Feuille Résultats de la semaine (SPEC « 4. Résultats » + décisions 11 et 12).
 * - Manche terminée : cérémonie (🥁 → scores → 👑 + confettis → 😭), puis le détail
 *   jour par jour, le gage et « Gage payé ✅ » (validé par l'autre).
 * - Manche en cours : classement provisoire, sans cérémonie.
 * S'ouvre toute seule à la première visite après la fin d'une manche (App.tsx) :
 * on la marque « vue » dès l'ouverture.
 */
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { DayKey } from '../core/types'
import { useDuel } from '../data/DuelProvider'
import { celebrate, emojiRain } from '../ui/confetti'
import { Button, SectionTitle, Sheet } from '../ui/kit'
import { atLeast, Ceremony, type Stage } from './results/Ceremony'
import { DayBreakdown } from './results/DayBreakdown'
import { GageCard } from './results/GageCard'
import { LiveStandings } from './results/LiveStandings'
import { RecordStrip, WeekBadges } from './results/RecordStrip'
import { useWeekResults, type WeekResults } from './results/useWeekResults'
import { tokenColor } from './weighin/format'
import { SheetGlow } from './weighin/SheetGlow'

/** Durée du compteur des scores (pour le plus gros score). */
const COUNT_MS = 1700
/** Durée de chaque étape de la cérémonie avant la suivante. */
const STAGE_MS: Record<Exclude<Stage, 'done'>, number> = { drumroll: 1900, count: COUNT_MS + 450, crown: 1500 }
const NEXT: Record<Exclude<Stage, 'done'>, Stage> = { drumroll: 'count', count: 'crown', crown: 'done' }

export function ResultsSheet({ weekStart, onClose }: { weekStart: DayKey | null; onClose: () => void }) {
  const { season } = useDuel()
  // On garde la dernière manche affichée pendant l'animation de fermeture.
  const [shown, setShown] = useState<DayKey | null>(weekStart)
  if (weekStart !== null && weekStart !== shown) setShown(weekStart)
  const display = weekStart ?? shown
  const week = display ? season.weeks.find((w) => w.weekStart === display) : undefined
  const title = week && !week.finished ? '⏳ Manche en cours' : '🏆 Résultats'

  return (
    <Sheet open={weekStart !== null} onClose={onClose} title={title}>
      {display && <ResultsContent key={display} weekStart={display} onClose={onClose} />}
    </Sheet>
  )
}

function ResultsContent({ weekStart, onClose }: { weekStart: DayKey; onClose: () => void }) {
  const { source, snapshot, me, today, season } = useDuel()
  const results = useWeekResults(weekStart)
  const reduced = useReducedMotion() ?? false
  const finished = results?.week.finished ?? false
  const root = useRef<HTMLDivElement>(null)

  // Déjà vue ? Alors version courte (la couronne tombe, sans suspense ni confettis).
  const [seenAtOpen] = useState(() => snapshot.seenResults.includes(weekStart))
  const [festive, setFestive] = useState(!seenAtOpen)
  const [run, setRun] = useState(0)
  const [stage, setStage] = useState<Stage>(() => (!finished || reduced ? 'done' : seenAtOpen ? 'crown' : 'drumroll'))

  // La cérémonie est vue dès l'ouverture (une seule fois).
  const marked = useRef(false)
  useEffect(() => {
    if (!finished || marked.current) return
    marked.current = true
    if (!snapshot.seenResults.includes(weekStart)) void source.markResultsSeen(weekStart)
  }, [finished, weekStart, source, snapshot.seenResults])

  // Les étapes s'enchaînent toutes seules.
  useEffect(() => {
    if (stage === 'done') return
    const t = window.setTimeout(() => setStage(NEXT[stage]), STAGE_MS[stage])
    return () => window.clearTimeout(t)
  }, [stage, run])

  // 🎉 Confettis à l'arrivée de la couronne.
  const fired = useRef(-1)
  useEffect(() => {
    if (stage !== 'crown' || !festive || !results || fired.current === run) return
    fired.current = run
    fireCeremony(results, me.id)
  }, [stage, festive, results, run, me.id])

  if (!results) {
    return (
      <div className="flex flex-col items-center pt-16 text-center">
        <span className="emoji-xl text-[80px]" aria-hidden="true">
          🤷
        </span>
        <p className="mt-4 font-display text-2xl font-bold">Manche introuvable</p>
        <p className="mt-1 text-[15px] text-muted">Elle n’a peut-être pas encore commencé.</p>
        <Button className="mt-6" onClick={onClose}>
          Retour
        </Button>
      </div>
    )
  }

  const replay = () => {
    root.current?.closest('[role="dialog"]')?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
    setFestive(true)
    setRun((r) => r + 1)
    setStage(reduced ? 'done' : 'drumroll')
  }

  const isLastFinished = season.finished.at(-1)?.weekStart === weekStart
  const glow = finished && atLeast(stage, 'crown') ? (results.winner?.color ?? 'var(--color-gold)') : 'var(--color-gold)'
  const showDetails = !finished || stage === 'done'

  return (
    <div ref={root} className="pb-4">
      <SheetGlow color={glow} height={420} />

      {finished ? (
        <Ceremony
          key={run}
          results={results}
          stage={stage}
          countMs={COUNT_MS}
          meId={me.id}
          reduced={reduced}
          onSkip={() => setStage('crown')}
        />
      ) : (
        <LiveStandings results={results} meId={me.id} />
      )}

      {showDetails && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        >
          {results.badges.length > 0 && (
            <>
              <SectionTitle>🏅 Badges de la manche</SectionTitle>
              <WeekBadges results={results} />
            </>
          )}

          <SectionTitle>{finished ? '😈 Le gage' : '🎲 L’enjeu'}</SectionTitle>
          <GageCard results={results} />

          <SectionTitle>📅 Jour par jour</SectionTitle>
          <DayBreakdown results={results} today={today} />

          <div className="mt-4">
            <RecordStrip results={results} />
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <Button size="xl" block onClick={onClose}>
              {closeLabel(results, me.id, isLastFinished)}
            </Button>
            {finished && (
              <Button variant="soft" size="md" block onClick={replay}>
                🥁 Revoir la cérémonie
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function closeLabel(results: WeekResults, meId: string, isLastFinished: boolean): string {
  if (!results.week.finished || !isLastFinished) return 'Retour au duel 🥊'
  if (results.tie) return 'Au prochain round 🥊'
  return results.winner?.id === meId ? 'On remet ça 😎' : 'Revanche ! 😤'
}

function fireCeremony(results: WeekResults, meId: string) {
  const gold = tokenColor('--color-gold', '#ffc23d')
  if (!results.winner) {
    const colors = [results.left.color, results.right.color, gold]
    celebrate(colors)
    window.setTimeout(() => emojiRain('🤝', colors), 450)
    return
  }
  const colors = [results.winner.color, gold]
  celebrate(colors)
  // Le gagnant voit pleuvoir des couronnes, le perdant… des larmes 😭 (avec amour).
  window.setTimeout(() => emojiRain(results.winner?.id === meId ? '👑' : '😭', colors), 450)
}
