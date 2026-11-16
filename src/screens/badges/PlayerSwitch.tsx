/**
 * Bascule « Moi / Laetitia » façon affiche de combat : chaque moitié montre
 * l'avatar, le compteur « 4 / 8 badges » et une petite jauge à la couleur du joueur.
 */
import { motion, useReducedMotion } from 'motion/react'
import type { Player, PlayerId } from '../../core/types'
import { Avatar, AnimatedNumber, playerStyle, springy } from '../../ui/kit'
import type { ShowcaseCount } from './model'

export interface SwitchOption {
  player: Player
  label: string
  count: ShowcaseCount
}

export function PlayerSwitch({
  options,
  value,
  onChange,
}: {
  options: [SwitchOption, SwitchOption]
  value: PlayerId
  onChange: (id: PlayerId) => void
}) {
  const reduced = useReducedMotion() ?? false
  return (
    <div role="radiogroup" aria-label="Voir les badges de" className="card relative grid grid-cols-2 gap-2 p-2">
      {options.map((o, i) => {
        const active = o.player.id === value
        const pct = o.count.total > 0 ? (o.count.unlocked / o.count.total) * 100 : 0
        return (
          <motion.button
            key={o.player.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${o.label} : ${o.count.unlocked} badges sur ${o.count.total}`}
            onClick={() => onChange(o.player.id)}
            whileTap={{ scale: 0.95 }}
            transition={springy}
            className={`relative flex min-h-[88px] flex-col justify-center gap-2 rounded-[22px] py-2.5 ${i === 0 ? 'pr-5 pl-3' : 'pr-3 pl-5'}`}
            style={playerStyle(o.player)}
          >
            {active && (
              <motion.span
                layoutId={reduced ? undefined : 'badges-switch-pill'}
                className="absolute inset-0 rounded-[22px]"
                style={{
                  background: 'color-mix(in oklab, var(--pc) 15%, transparent)',
                  boxShadow: 'inset 0 0 0 2.5px var(--pc)',
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative flex items-center gap-2.5">
              <motion.span
                animate={{ scale: active ? 1.08 : 0.94, rotate: active ? (i === 0 ? -6 : 6) : 0 }}
                transition={springy}
                className={active ? '' : 'opacity-75 grayscale-[0.4]'}
              >
                <Avatar player={o.player} size="sm" />
              </motion.span>
              <span className="flex min-w-0 flex-col items-start">
                <span className={`truncate font-display text-[17px] leading-tight font-semibold ${active ? 'text-ink' : 'text-ink-soft'}`}>
                  {o.label}
                </span>
                <span className="flex items-baseline gap-1 leading-none whitespace-nowrap">
                  <AnimatedNumber value={o.count.unlocked} className="text-[26px] text-ink" />
                  <span className="score-num text-[15px] text-muted">/ {o.count.total}</span>
                  {/* « badges » seulement si la place le permet (petits écrans : « 4 / 8 »). */}
                  <span className="hidden text-[13px] font-bold text-muted min-[380px]:inline">
                    {o.count.unlocked > 1 ? 'badges' : 'badge'}
                  </span>
                </span>
              </span>
            </span>
            <span className="relative block h-2 w-full overflow-hidden rounded-full bg-sunken">
              <motion.span
                className="block h-full rounded-full"
                style={{ background: 'var(--pc)' }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 140, damping: 20, delay: 0.15 }}
              />
            </span>
          </motion.button>
        )
      })}
      {/* Bulle « VS » au milieu. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface font-display text-[13px] font-bold text-ink shadow-[var(--shadow-card)] ring-2 ring-line"
      >
        VS
      </span>
    </div>
  )
}
