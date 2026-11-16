/**
 * 7. 🧪 Démo : commandes de la maquette (changer de joueur, voyager dans le temps…).
 * N'apparaît que si useDuel().demo existe : disparaîtra avec la vraie connexion.
 */
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { ISO_DAY_SHORT, addDays, formatDay, weekDays, weekStartOf } from '../../core/dates'
import { useDuel } from '../../data/DuelProvider'
import { Avatar, Button, springy } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { deName, tint } from './format'
import { Label, Section } from './ui'

export function DemoSection({ index }: { index: number }) {
  const { demo, snapshot, me, other, today, source } = useDuel()
  const toast = useToast()
  const reduced = useReducedMotion() ?? false
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!confirmReset) return
    const t = window.setTimeout(() => setConfirmReset(false), 4000)
    return () => window.clearTimeout(t)
  }, [confirmReset])

  if (!demo) return null

  const realToday = demo.realToday()
  const days = weekDays(weekStartOf(realToday))
  const lastWeek = addDays(weekStartOf(today), -7)

  const travel = (day: string) => {
    if (day === today) return
    // Le voyage régénère les données : on garde la cérémonie « vue » si elle l'était déjà.
    const seen = snapshot.seenResults.includes(lastWeek)
    demo.setToday(day)
    if (seen && weekStartOf(day) === weekStartOf(today)) void source.markResultsSeen(lastWeek)
    toast({ text: `⏳ Nous voilà ${formatDay(day, 'EEEE d MMMM')}${day === realToday ? ' (pour de vrai)' : ''}` })
  }

  return (
    <Section
      index={index}
      emoji="🧪"
      title="Démo"
      subtitle="Mode démo — disparaîtra avec la vraie connexion"
      className="border-[3px] border-dashed"
      style={{ borderColor: tint('var(--color-gold)', 70, 'var(--color-line)'), background: tint('var(--color-gold)', 7) }}
    >
      <Label>Jouer en tant que</Label>
      <div className="grid grid-cols-2 gap-2.5">
        {snapshot.players.map((p) => {
          const active = p.id === me.id
          return (
            <motion.button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (active) return
                demo.switchPlayer(p.id)
                toast({ text: `Tu joues maintenant ${p.name} ${p.emoji}`, color: p.color })
              }}
              whileTap={reduced ? undefined : { scale: 0.94 }}
              transition={springy}
              className="flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-3xl px-2 py-3"
              style={{
                background: active ? tint(p.color, 22) : 'var(--color-surface)',
                boxShadow: active ? `inset 0 0 0 3px ${p.color}` : '0 4px 0 var(--color-line)',
              }}
            >
              <Avatar player={p} size="sm" />
              <span className="font-display text-[16px] leading-tight font-semibold text-ink">
                {active ? `✓ ${p.name}` : p.name}
              </span>
            </motion.button>
          )
        })}
      </div>

      <Label>Voyage dans le temps ⏳</Label>
      <div role="radiogroup" aria-label="Jour de la démo" className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const active = d === today
          const real = d === realToday
          return (
            <motion.button
              key={d}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${formatDay(d, 'EEEE d MMMM')}${real ? ' (vrai jour)' : ''}`}
              onClick={() => travel(d)}
              whileTap={reduced ? undefined : { scale: 0.85 }}
              transition={springy}
              className="relative flex h-16 flex-col items-center justify-center rounded-2xl font-display leading-none"
              style={{
                background: active ? me.color : 'var(--color-surface)',
                color: active ? '#fff' : 'var(--color-ink-soft)',
                boxShadow: active ? `0 4px 0 color-mix(in oklab, ${me.color} 65%, black)` : '0 3px 0 var(--color-line)',
              }}
            >
              <span className="text-[13px] font-semibold opacity-80">{ISO_DAY_SHORT[i]}</span>
              <span className="mt-1 text-[19px] font-bold">{formatDay(d, 'd')}</span>
              {real && (
                <span className="absolute -top-2 text-[14px]" aria-hidden="true">
                  📍
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
      <p className="mt-2 px-1 text-center text-[15px] text-muted">
        {today === realToday ? '📍 = le vrai jour. Tape un jour pour y aller.' : `Démo réglée sur ${formatDay(today, 'EEEE d MMMM')} · 📍 = le vrai jour`}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <Button variant="soft" block onClick={() => demo.simulateOtherCheckin()}>
          👀 Simuler le check-in {deName(other.name)}
        </Button>
        <Button variant="soft" block onClick={() => demo.replayResults()}>
          🏆 Revoir la cérémonie
        </Button>
        <Button
          variant={confirmReset ? 'primary' : 'soft'}
          color={confirmReset ? 'var(--color-craquage)' : undefined}
          block
          onClick={() => {
            if (!confirmReset) return setConfirmReset(true)
            setConfirmReset(false)
            demo.reset()
            toast({ text: 'Démo remise à zéro 🔄' })
          }}
        >
          {confirmReset ? '⚠️ Sûr ? Tape encore pour tout effacer' : '🔄 Remettre la démo à zéro'}
        </Button>
      </div>
    </Section>
  )
}
