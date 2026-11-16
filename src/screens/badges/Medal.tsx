/**
 * 🏅 La médaille d'un badge : anneau doré, disque à la couleur du joueur, rubans,
 * reflet qui balaie la médaille de temps en temps. Version grisée et cadenassée
 * tant que le badge n'est pas débloqué.
 */
import { motion, useReducedMotion } from 'motion/react'

export type MedalState = 'unlocked' | 'locked' | 'na'

const SIZES = { sm: 44, md: 84, lg: 124, xl: 168 } as const
export type MedalSize = keyof typeof SIZES

const GOLD = 'var(--color-gold)'
const GOLD_DARK = 'var(--color-gold-dark)'
const GOLD_LIGHT = 'color-mix(in oklab, var(--color-gold) 40%, white)'

/** Anneau doré « métal » (dégradé conique). */
const RING = `conic-gradient(from 210deg, ${GOLD}, ${GOLD_LIGHT} 12%, ${GOLD} 25%, ${GOLD_DARK} 45%, ${GOLD} 62%, ${GOLD_LIGHT} 82%, ${GOLD})`

export function Medal({
  emoji,
  state,
  color,
  size = 'md',
  count = 0,
  shineDelay = 0,
  ribbons = true,
}: {
  emoji: string
  state: MedalState
  /** Couleur du joueur (disque central, rubans, pastille ×N). */
  color: string
  size?: MedalSize
  /** Affiche « ×N » si > 1. */
  count?: number
  /** Décalage du reflet (pour que toutes les médailles ne brillent pas en même temps). */
  shineDelay?: number
  ribbons?: boolean
}) {
  const reduced = useReducedMotion() ?? false
  const px = SIZES[size]
  const unlocked = state === 'unlocked'
  const showRibbons = ribbons && state !== 'na' && size !== 'sm'

  return (
    <div className="relative shrink-0" style={{ width: px, height: showRibbons ? px * 1.14 : px }} aria-hidden="true">
      {showRibbons && <Ribbons px={px} color={unlocked ? color : 'var(--color-line)'} />}

      {unlocked ? (
        <div
          className="absolute top-0 left-0 rounded-full"
          style={{
            width: px,
            height: px,
            background: RING,
            boxShadow: `0 ${Math.round(px * 0.05)}px 0 color-mix(in oklab, ${GOLD_DARK} 75%, black), 0 ${Math.round(px * 0.12)}px ${Math.round(px * 0.26)}px -${Math.round(px * 0.1)}px color-mix(in oklab, ${GOLD} 85%, transparent)`,
          }}
        >
          <div
            className="absolute grid place-items-center overflow-hidden rounded-full"
            style={{
              inset: px * 0.09,
              background: `radial-gradient(circle at 32% 26%, color-mix(in oklab, ${color} 38%, white), ${color} 62%, color-mix(in oklab, ${color} 78%, black))`,
              boxShadow: `inset 0 ${px * 0.035}px ${px * 0.07}px color-mix(in oklab, ${color} 45%, black), inset 0 -${px * 0.02}px 0 color-mix(in oklab, white 35%, transparent)`,
            }}
          >
            <span
              className="leading-none select-none"
              style={{ fontSize: px * 0.46, filter: 'drop-shadow(0 3px 3px rgb(0 0 0 / 0.25))' }}
            >
              {emoji}
            </span>
            {/* Reflet qui balaie la médaille. */}
            {!reduced && (
              <motion.div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'linear-gradient(110deg, transparent 30%, color-mix(in oklab, white 75%, transparent) 48%, color-mix(in oklab, white 30%, transparent) 54%, transparent 68%)',
                }}
                initial={{ x: '-110%' }}
                animate={{ x: '110%' }}
                transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity, repeatDelay: 3.6, delay: 0.6 + shineDelay }}
              />
            )}
          </div>
          {/* Petit éclat en haut à gauche, comme du métal poli. */}
          <span
            className="pointer-events-none absolute rounded-full"
            style={{
              top: px * 0.13,
              left: px * 0.2,
              width: px * 0.2,
              height: px * 0.09,
              rotate: '-35deg',
              background: 'color-mix(in oklab, white 70%, transparent)',
              filter: 'blur(1px)',
            }}
          />
        </div>
      ) : (
        <div
          className="absolute top-0 left-0 grid place-items-center rounded-full bg-sunken"
          style={{
            width: px,
            height: px,
            border: state === 'locked' ? `${Math.max(2, px * 0.035)}px dashed var(--color-line)` : undefined,
            boxShadow: 'inset 0 4px 10px -4px color-mix(in oklab, var(--color-ink) 22%, transparent)',
          }}
        >
          <span
            className="leading-none select-none"
            style={{ fontSize: px * 0.44, filter: 'grayscale(1)', opacity: state === 'locked' ? 0.38 : 0.28 }}
          >
            {emoji}
          </span>
        </div>
      )}

      {state === 'locked' && size !== 'sm' && (
        <span
          className="absolute grid place-items-center rounded-full bg-surface leading-none shadow-[var(--shadow-card)]"
          style={{ width: px * 0.36, height: px * 0.36, right: -px * 0.04, top: px * 0.66, fontSize: px * 0.19 }}
        >
          🔒
        </span>
      )}

      {unlocked && count > 1 && (
        <span
          className="score-num absolute grid min-w-[2.1em] place-items-center rounded-full px-1.5 leading-none text-white ring-[3px] ring-surface"
          style={{
            top: -px * 0.02,
            right: -px * 0.08,
            height: Math.max(26, px * 0.3),
            fontSize: Math.max(14, px * 0.17),
            background: color,
            boxShadow: `0 3px 0 color-mix(in oklab, ${color} 65%, black)`,
          }}
        >
          ×{count}
        </span>
      )}
    </div>
  )
}

/** Deux rubans qui dépassent sous la médaille. */
function Ribbons({ px, color }: { px: number; color: string }) {
  const w = px * 0.27
  const h = px * 0.5
  const common = {
    width: w,
    height: h,
    top: px * 0.62,
    background: `linear-gradient(180deg, color-mix(in oklab, ${color} 80%, black), ${color} 35%)`,
    clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)',
  }
  return (
    <>
      <span className="absolute" style={{ ...common, left: px / 2 - w * 0.95, rotate: '18deg', transformOrigin: 'top center' }} />
      <span className="absolute" style={{ ...common, left: px / 2 - w * 0.05, rotate: '-18deg', transformOrigin: 'top center' }} />
    </>
  )
}
