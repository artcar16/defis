/**
 * 🎰 Roulette des gages, façon machine à sous : le rouleau défile (~2 s), ralentit,
 * dépasse un poil et revient se caler sur le gage tiré au hasard.
 */
import { animate, motion, useMotionValue, useReducedMotion, useTransform, useVelocity } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { burst } from '../../ui/confetti'
import { springy } from '../../ui/kit'
import { ON_GOLD, tint } from './format'

const ROW_H = 64
const LOOPS = 5
const EMPTY_LABEL = '❓ Pas encore d’enjeu'

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Les voisins d'un gage dans la liste (pour remplir le haut et le bas du rouleau). */
function neighbours(gages: string[], label: string): [string, string] {
  const n = gages.length
  if (n === 0) return ['', '']
  const i = gages.indexOf(label)
  if (i < 0) return [gages[n - 1], gages[0]]
  return [gages[(i - 1 + n) % n], gages[(i + 1) % n]]
}

export function Roulette({
  gages,
  current,
  editable,
  colors,
  onResult,
}: {
  gages: string[]
  /** Enjeu actuel (au centre du rouleau au repos). */
  current: string | null
  editable: boolean
  /** Couleurs des confettis (celles des joueurs). */
  colors: string[]
  /** Appelé avec le gage tiré, une fois le rouleau arrêté. */
  onResult: (gage: string) => Promise<void>
}) {
  const reduced = useReducedMotion() ?? false
  const y = useMotionValue(0)
  const velocity = useVelocity(y)
  const blur = useTransform(velocity, (v) => `blur(${Math.min(3.5, Math.abs(v) / 1100).toFixed(2)}px)`)
  const windowRef = useRef<HTMLDivElement>(null)
  const [spinReel, setSpinReel] = useState<string[] | null>(null)
  const [flash, setFlash] = useState(0)

  const label = current ?? EMPTY_LABEL
  const idleReel = useMemo(() => {
    const [before, after] = neighbours(gages, label)
    return [before, label, after]
  }, [gages, label])
  const reel = spinReel ?? idleReel
  const spinning = spinReel !== null

  // Retour au repos : on recale le rouleau avant l'affichage (pas de saut visible).
  useLayoutEffect(() => {
    if (!spinReel) y.set(0)
  }, [spinReel, y])

  const spin = async () => {
    if (spinning || gages.length === 0 || !editable) return
    const pool = gages.length > 1 ? gages.filter((g) => g !== current) : gages
    const pick = pool[Math.floor(Math.random() * pool.length)]
    const [before, after] = neighbours(gages, pick)
    const filler: string[] = []
    for (let k = 0; k < (reduced ? 0 : LOOPS); k++) filler.push(...shuffle(gages))
    const items = [...idleReel, ...filler, before, pick, after]
    const target = items.length - 2
    const final = -(target - 1) * ROW_H
    setSpinReel(items)
    navigator.vibrate?.(15)
    if (reduced) {
      y.set(final)
    } else {
      await animate(y, final - 18, { duration: 2.1, ease: [0.1, 0.65, 0.2, 1] })
      await animate(y, final, { type: 'spring', stiffness: 420, damping: 14 })
    }
    navigator.vibrate?.([20, 40, 30])
    setFlash((f) => f + 1)
    const r = windowRef.current?.getBoundingClientRect()
    if (r) burst(['#FFC23D', ...colors], { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight })
    try {
      await onResult(pick)
    } finally {
      setSpinReel(null)
    }
  }

  return (
    <div>
      <div
        ref={windowRef}
        className="relative overflow-hidden rounded-3xl bg-sunken"
        style={{
          height: ROW_H * 3,
          boxShadow: `inset 0 0 0 3px var(--color-gold), inset 0 10px 18px -12px rgb(0 0 0 / 0.35), 0 5px 0 var(--color-gold-dark)`,
        }}
        aria-live="polite"
        aria-atomic="true"
      >
        {/* Bande centrale (le gage tiré) */}
        <motion.div
          key={flash}
          className="absolute inset-x-2 rounded-2xl"
          style={{ top: ROW_H, height: ROW_H, background: tint('var(--color-gold)', 30, 'var(--color-surface)') }}
          initial={flash && !reduced ? { scale: 1.08 } : false}
          animate={{ scale: 1 }}
          transition={springy}
        />
        {/* Rouleau */}
        <motion.ul
          className="relative"
          style={{ y, filter: reduced ? undefined : blur }}
          aria-hidden={spinning}
        >
          {reel.map((g, i) => (
            <li
              key={`${i}-${g}`}
              className="flex items-center justify-center px-11 text-center font-display text-[17px] leading-snug font-semibold text-balance"
              style={{ height: ROW_H, color: i === (spinning ? -1 : 1) ? 'var(--color-ink)' : 'var(--color-muted)' }}
            >
              <span className="line-clamp-2">{g}</span>
            </li>
          ))}
        </motion.ul>
        {/* Fondu haut / bas */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(180deg, var(--color-sunken) 0%, transparent 34%, transparent 66%, var(--color-sunken) 100%)`,
          }}
        />
        {/* Flèches */}
        {(['left', 'right'] as const).map((side) => (
          <motion.span
            key={side}
            className="absolute text-[22px] leading-none"
            style={{ top: ROW_H * 1.5, [side]: 6, color: 'var(--color-gold-dark)', translateY: '-50%' }}
            animate={spinning && !reduced ? { x: side === 'left' ? [0, 4, 0] : [0, -4, 0] } : { x: 0 }}
            transition={spinning ? { duration: 0.18, repeat: Infinity } : springy}
            aria-hidden="true"
          >
            {side === 'left' ? '▶' : '◀'}
          </motion.span>
        ))}
        {!editable && (
          <span
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-surface text-[18px] shadow-[var(--shadow-card)]"
            aria-hidden="true"
          >
            🔒
          </span>
        )}
      </div>

      {editable && (
        <motion.button
          type="button"
          onClick={() => void spin()}
          // Pendant le tirage, le bouton reste doré (pas grisé) mais ne relance pas.
          disabled={gages.length === 0}
          aria-disabled={spinning || undefined}
          whileTap={{ scale: 0.96 }}
          transition={springy}
          className="btn-chunky mt-4 min-h-16 w-full px-6 text-[21px]"
          style={{ ['--btn' as string]: 'var(--color-gold)', ['--btn-ink' as string]: ON_GOLD }}
        >
          <motion.span
            className="inline-block text-[28px] leading-none"
            animate={spinning && !reduced ? { rotate: 360 } : { rotate: 0 }}
            transition={spinning ? { duration: 0.5, repeat: Infinity, ease: 'linear' } : springy}
            aria-hidden="true"
          >
            🎲
          </motion.span>
          {spinning ? 'Ça tourne…' : gages.length === 0 ? 'Ajoute des gages d’abord' : 'Lancer la roulette'}
        </motion.button>
      )}
    </div>
  )
}
