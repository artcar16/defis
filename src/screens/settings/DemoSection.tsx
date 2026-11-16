/**
 * 7. 🧪 Démo : commandes de la maquette (changer de joueur, voyager dans le temps…).
 * N'apparaît que si useDuel().demo existe : disparaîtra avec la vraie connexion.
 */
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { formatDay } from '../../core/dates'
import { dayNumber, deName, frDate, queName } from '../../core/fr'
import type { DayKey } from '../../core/types'
import { useDuel } from '../../data/DuelProvider'
import { tint } from '../../ui/color'
import { Avatar, Button, springy } from '../../ui/kit'
import { useToast } from '../../ui/toast'
import { Label, Section } from './ui'

export function DemoSection({ index }: { index: number }) {
  const { demo, snapshot, me, other, today } = useDuel()
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
  // La vraie semaine + le lundi suivant (cérémonie de la manche, propositions acceptées).
  const days = demo.travelDays()
  const nextMondayDay = days.at(-1)

  const travel = (day: DayKey) => {
    if (day === today) return
    // La source garde tout ce que le joueur a fait (et les cérémonies déjà vues) : rien à refaire ici.
    demo.setToday(day)
    const where = `${frDate(day)}${day === realToday ? ' (pour de vrai)' : day === nextMondayDay ? ' (lundi prochain)' : ''}`
    toast(
      day > today
        ? { text: `⏳ Nous voilà ${where}. Tout ce que tu as fait est gardé 👍` }
        : { text: `⏪ Retour à ${where}. Ce qui venait après est effacé 🧽` },
    )
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
                toast({ text: `Tu joues maintenant en tant ${queName(p.name)} ${p.emoji}`, color: p.color })
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
      {/* 8 jours en 4 × 2 : des cibles larges (≥ 60 px), même sur iPhone SE. */}
      <div role="radiogroup" aria-label="Jour de la démo" className="grid grid-cols-4 gap-1.5">
        {days.map((d) => {
          const active = d === today
          const real = d === realToday
          const next = d === nextMondayDay
          return (
            <motion.button
              key={d}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${frDate(d)}${real ? ' (vrai jour)' : next ? ' (lundi prochain)' : ''}`}
              onClick={() => travel(d)}
              whileTap={reduced ? undefined : { scale: 0.88 }}
              transition={springy}
              className="relative flex h-[68px] flex-col items-center justify-center rounded-2xl font-display leading-none"
              style={{
                // Couleur du joueur en version lisible (fond assombri ou encre foncée si besoin).
                background: active ? `var(--me-btn, ${me.color})` : 'var(--color-surface)',
                color: active ? 'var(--me-ink, #fff)' : 'var(--color-ink-soft)',
                boxShadow: active ? `0 4px 0 color-mix(in oklab, ${me.color} 65%, black)` : '0 3px 0 var(--color-line)',
              }}
            >
              <span className="text-[13px] font-semibold opacity-80">{formatDay(d, 'EEE')}</span>
              <span className="mt-1 text-[19px] font-bold">{dayNumber(d)}</span>
              {next && <span className="mt-1 text-[11px] font-semibold opacity-80">prochain</span>}
              {real && (
                <span className="absolute -top-2 text-[14px]" aria-hidden="true">
                  📍
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
      <p className="mt-2.5 px-1 text-center text-[15px] leading-snug text-balance text-muted">
        {today === realToday ? '📍 = le vrai jour. ' : `Démo réglée sur ${frDate(today)}. 📍 = le vrai jour. `}
        Le voyage garde ce que tu as fait (revenir en arrière efface la suite).
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
            // Tout repart à zéro, y compris les cérémonies et badges déjà vus (ils sont dans la source).
            demo.reset()
            toast({ text: 'Démo remise à zéro 🔄' })
          }}
        >
          {confirmReset ? '⚠️ Sûr ? Tape encore pour tout effacer' : '🔄 Remettre la démo à zéro'}
        </Button>
      </div>
    </Section>
  )
}
