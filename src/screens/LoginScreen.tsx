/**
 * 🥊 Écran de connexion : grand titre, les deux joueurs face à face. Pas de compte ni
 * d'email (décision 20) : on choisit son prénom. En maquette, « Jouer en tant que ».
 */
import { motion, useReducedMotion } from 'motion/react'
import { DEFAULT_PLAYERS } from '../config/defaults'
import { queName } from '../core/fr'
import type { Player } from '../core/types'
import { useDuel } from '../data/DuelProvider'
import { deep, tint } from '../ui/color'
import { Avatar, Button, springy } from '../ui/kit'
import { ON_GOLD } from './settings/format'

type Fighter = Pick<Player, 'id' | 'name' | 'emoji' | 'color'>

/** Emojis qui flottent en fond (purement décoratifs). */
const FLOATERS = [
  { e: '🍪', top: 64, left: '5%', size: 34, delay: 0 },
  { e: '💅', top: 36, right: '8%', size: 30, delay: 0.8 },
  { e: '🏃', top: 236, left: '3%', size: 28, delay: 1.6 },
  { e: '🦟', top: 218, right: '4%', size: 26, delay: 0.4 },
  { e: '🏆', top: 8, left: '30%', size: 24, delay: 1.2 },
]

export function LoginScreen() {
  const { demo, snapshot } = useDuel()
  const reduced = useReducedMotion() ?? false

  const fighters: Fighter[] =
    snapshot.players.length >= 2 ? snapshot.players : DEFAULT_PLAYERS.map((p) => ({ id: p.key, name: p.name, emoji: p.emoji, color: p.color }))
  const [left, right] = fighters

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden px-4 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      {/* Décor */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {FLOATERS.map((f) => (
          <span
            key={f.e}
            className="absolute animate-float opacity-40"
            style={{ top: f.top, left: f.left, right: f.right, fontSize: f.size, animationDelay: `${f.delay}s` }}
          >
            {f.e}
          </span>
        ))}
      </div>

      {/* Titre */}
      <header className="relative pt-10 text-center">
        <motion.h1
          className="font-display text-[46px] leading-[0.95] font-bold tracking-tight text-ink"
          initial={reduced ? false : { y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...springy, delay: 0.12 }}
        >
          Duel des{' '}
          <span className="whitespace-nowrap">
            Défauts{' '}
            <motion.span
              className="inline-block origin-bottom-left"
              animate={reduced ? undefined : { rotate: [0, -18, 14, 0], x: [0, -4, 6, 0] }}
              transition={{ duration: 0.7, delay: 0.9, repeat: Infinity, repeatDelay: 3 }}
              aria-hidden="true"
            >
              🥊
            </motion.span>
          </span>
        </motion.h1>
        <motion.p
          className="mx-auto mt-3 max-w-[20rem] text-[16px] leading-snug font-semibold text-balance text-ink-soft"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Ongles, grattage, grignotage… Que le duel commence&nbsp;: qui perd fait la vaisselle 🍽️
        </motion.p>
      </header>

      {/* Face à face */}
      <div className="relative mt-7 flex items-center justify-center gap-3" role="img" aria-label={`${left.name} contre ${right.name}`}>
        <FighterCard player={left} side="left" />
        <motion.div
          className="z-10 grid size-16 shrink-0 place-items-center rounded-full font-display text-[26px] font-bold"
          style={{ background: 'var(--color-gold)', color: ON_GOLD, boxShadow: '0 5px 0 var(--color-gold-dark), var(--shadow-pop)' }}
          initial={reduced ? false : { scale: 0, rotate: -60 }}
          animate={{ scale: 1, rotate: -8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 12, delay: 0.45 }}
          aria-hidden="true"
        >
          VS
        </motion.div>
        <FighterCard player={right} side="right" />
      </div>

      {/* Mode démo */}
      {demo && (
        <motion.section
          className="card relative mt-8 border-[3px] border-dashed p-4"
          style={{ borderColor: tint('var(--color-gold)', 70, 'var(--color-line)'), background: tint('var(--color-gold)', 8) }}
          initial={reduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springy, delay: 0.55 }}
          aria-labelledby="demo-title"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-[30px] leading-none" aria-hidden="true">
              🧪
            </span>
            <div>
              <h2 id="demo-title" className="font-display text-[20px] leading-tight font-bold text-ink">
                Mode démo
              </h2>
              <p className="text-[15px] leading-snug font-semibold text-muted">Choisis ton camp&nbsp;!</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3.5">
            {[left, right].map((p) => (
              <Button key={p.id} block size="lg" color={p.color} className="text-[19px]!" onClick={() => demo.signInAs(p.id)}>
                Jouer en tant {queName(p.name)} {p.emoji}
              </Button>
            ))}
          </div>
        </motion.section>
      )}

      <p className="relative mt-5 text-center text-[13px] font-semibold text-muted">Rien que vous deux. Pas de pub, pas de pitié 😈</p>
    </div>
  )
}

function FighterCard({ player, side }: { player: Fighter; side: 'left' | 'right' }) {
  const reduced = useReducedMotion() ?? false
  const dir = side === 'left' ? -1 : 1
  return (
    <motion.div
      // iPhone SE : un peu plus petits, pour que le face-à-face tienne sans toucher les bords.
      className="flex w-[100px] flex-col items-center min-[360px]:w-[118px]"
      initial={reduced ? false : { x: dir * 140, rotate: dir * 25, opacity: 0 }}
      animate={{ x: 0, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.2 }}
    >
      <motion.div
        animate={reduced ? undefined : { y: [0, -6, 0], rotate: [0, dir * -3, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: side === 'left' ? 0 : 1.2 }}
      >
        <Avatar player={player} size="xl" ring className="max-[359px]:size-24 max-[359px]:text-6xl" />
      </motion.div>
      <div
        className="mt-3 max-w-full truncate font-display text-[20px] font-bold"
        style={{ color: deep(player.color, 78) }}
      >
        {player.name}
      </div>
    </motion.div>
  )
}
