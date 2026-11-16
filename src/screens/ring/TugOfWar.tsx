/**
 * 🪢 Le tir à la corde, vedette du Ring.
 *
 * Moi à gauche, l'autre à droite. Le nœud doré glisse vers celui qui mène
 * (proportionnellement à l'écart, voir `lean` dans useRingData), la corde est aux
 * couleurs des deux joueurs, et ça transpire 💦, ça soulève la poussière 💨,
 * ça tire par à-coups. Quand le score change en direct, le nœud rebondit à sa
 * nouvelle place et l'avatar de celui qui mène fait un bond.
 */
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type TargetAndTransition,
  type Transition,
} from 'motion/react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { formatPts } from '../../core/fr'
import type { Player } from '../../core/types'
import { onColor, tint } from '../../ui/color'
import { Avatar, softSpring } from '../../ui/kit'
import type { Standing } from './useRingData'

/** Course du nœud de part et d'autre du milieu, en % de la corde (au max, il touche les mains du leader). */
const KNOT_RANGE = 34
/**
 * Retrait des lutteurs par rapport au bord de la carte, en px. Celui qui mène se penche (14°)
 * et tire par à-coups (6 px) : il dépasse alors d'environ 12 px, qu'il faut garder dans la carte.
 */
const FIGHTER_INSET = 20
/** Retrait de la corde de chaque côté (elle part de l'intérieur des avatars), en px. */
const ROPE_INSET = FIGHTER_INSET + 48
/** Largeur de référence de l'arène, pour placer le dégradé des « camps » sous le nœud. */
const ARENA_REF_WIDTH = 358

export interface ArenaPulse {
  /** Change à chaque nouvelle activité → relance l'animation. */
  key: number
  /** Emoji qui s'envole au-dessus de l'avatar (✅, ⚖️…). */
  emoji: string
}

interface TugOfWarProps {
  left: Player
  right: Player
  /** Situation du joueur de gauche (celle de droite s'en déduit). */
  leftStanding: Standing
  /** -1 = nœud contre le joueur de gauche … +1 = contre celui de droite. */
  lean: number
  /** Écart de points affiché sur l'étiquette du nœud. */
  gap: number
  /** Change quand un score change → rebond de celui qui mène. */
  bounceKey: string
  /** Activité en direct de l'adversaire (côté droit). */
  pulse: ArenaPulse | null
  /** Personne n'a encore de points : pas de sueur, corde au repos. */
  calm?: boolean
}

const opposite: Record<Standing, Standing> = { lead: 'trail', trail: 'lead', even: 'even' }

export function TugOfWar({ left, right, leftStanding, lean, gap, bounceKey, pulse, calm = false }: TugOfWarProps) {
  const reduced = useReducedMotion() ?? false
  const target = Math.max(-1, Math.min(1, lean)) * KNOT_RANGE + 50

  // Le nœud part du milieu et file à sa place avec un ressort qui « tire ».
  const raw = useMotionValue(reduced ? target : 50)
  const spring = useSpring(raw, { stiffness: 110, damping: 11, mass: 1.1 })
  const knot = reduced ? raw : spring
  useEffect(() => {
    raw.set(target)
  }, [raw, target])

  const leader: 'left' | 'right' | null = leftStanding === 'lead' ? 'left' : leftStanding === 'trail' ? 'right' : null
  const leaderColor = leader === 'left' ? left.color : leader === 'right' ? right.color : null

  // À-coups synchronisés de toute la corde (et des joueurs) vers celui qui mène.
  const tugDir = leader === 'left' ? -1 : leader === 'right' ? 1 : 0
  const tug: TargetAndTransition | undefined =
    reduced || calm
      ? undefined
      : tugDir === 0
        ? { x: [0, -3, 3, -2, 0], transition: { duration: 1.2, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' } }
        : { x: [0, 6 * tugDir, 1 * tugDir, 4 * tugDir, 0], transition: { duration: 1.1, repeat: Infinity, repeatDelay: 1.3, ease: 'easeInOut' } }

  const territory = useTransform(knot, (v) => {
    const at = ((ROPE_INSET + (v / 100) * (ARENA_REF_WIDTH - 2 * ROPE_INSET)) / ARENA_REF_WIDTH) * 100
    const camp = (color: string, pct: number) => tint(color, pct, 'transparent')
    return `linear-gradient(90deg, ${camp(left.color, 24)} 0%, ${camp(left.color, 9)} ${at - 7}%, ${camp(right.color, 9)} ${at + 7}%, ${camp(right.color, 24)} 100%)`
  })

  return (
    <div className="relative h-[160px] select-none" aria-hidden="true">
      {/* Le tapis du ring : chaque camp à sa couleur, la frontière suit le nœud. */}
      <motion.div
        className="absolute inset-x-3 top-[14px] bottom-2 rounded-[26px]"
        style={{ background: territory, boxShadow: 'inset 0 -4px 0 color-mix(in oklab, black 6%, transparent)' }}
      />
      {/* La ligne du milieu. */}
      <div
        className="absolute top-[36px] bottom-5 left-1/2 -translate-x-1/2 border-l-[3px] border-dashed"
        style={{ borderColor: 'color-mix(in oklab, var(--color-ink) 16%, transparent)' }}
      />
      <div className="absolute top-[18px] left-1/2 -translate-x-1/2 font-display text-[11px] font-bold tracking-wider text-muted uppercase">
        milieu
      </div>
      {/* Ombres au sol sous les lutteurs. */}
      {(['left', 'right'] as const).map((pos) => (
        <div
          key={pos}
          className="absolute bottom-[22px] h-3 w-[72px] rounded-[50%]"
          style={{ [pos]: FIGHTER_INSET + 8, background: 'color-mix(in oklab, black 20%, transparent)', filter: 'blur(2px)' }}
        />
      ))}

      <Rope left={left} right={right} knot={knot} gap={gap} leaderColor={leaderColor} tug={tug} reduced={reduced} calm={calm} />

      <Fighter
        player={left}
        side="left"
        standing={leftStanding}
        bounceKey={bounceKey}
        tug={tug}
        reduced={reduced}
        calm={calm}
        pulse={null}
      />
      <Fighter
        player={right}
        side="right"
        standing={opposite[leftStanding]}
        bounceKey={bounceKey}
        tug={tug}
        reduced={reduced}
        calm={calm}
        pulse={pulse}
      />
    </div>
  )
}

// ─── La corde et le nœud ─────────────────────────────────────────────────────

/** Corde tressée : rayures en biais dans la couleur du joueur + reflet en haut. */
function ropeStyle(color: string): CSSProperties {
  return {
    background: `repeating-linear-gradient(115deg, ${color} 0 7px, color-mix(in oklab, ${color} 68%, black) 7px 10px)`,
    boxShadow: `inset 0 3px 0 color-mix(in oklab, ${color} 55%, white), inset 0 -3px 0 color-mix(in oklab, ${color} 60%, black)`,
  }
}

function Rope({
  left,
  right,
  knot,
  gap,
  leaderColor,
  tug,
  reduced,
  calm,
}: {
  left: Player
  right: Player
  knot: MotionValue<number>
  gap: number
  leaderColor: string | null
  tug: TargetAndTransition | undefined
  reduced: boolean
  calm: boolean
}) {
  const at = useTransform(knot, (v) => `${v}%`)
  // Près d'un avatar, l'étiquette se décale vers le milieu pour rester lisible.
  const tagShift = useTransform(knot, (v) => (50 - v) * 0.75)
  // La corde tendue vibre légèrement.
  const strain: TargetAndTransition | undefined =
    reduced || calm ? undefined : { y: [0, -1.4, 0, 1.4, 0], transition: { duration: 0.5, repeat: Infinity, ease: 'linear' } }

  return (
    <motion.div className="absolute top-[66px] h-4" style={{ left: ROPE_INSET, right: ROPE_INSET }} animate={tug}>
      <motion.div className="absolute inset-0" animate={strain}>
        <motion.div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: at, ...ropeStyle(left.color) }} />
        <motion.div className="absolute inset-y-0 right-0 rounded-r-full" style={{ left: at, ...ropeStyle(right.color) }} />
      </motion.div>

      {/* Le nœud doré et son étiquette qui pend. */}
      <motion.div className="absolute top-1/2 z-[5]" style={{ left: at }}>
        <div className="relative -translate-x-1/2 -translate-y-1/2">
          <div
            className="size-[34px] rounded-full ring-4 ring-surface"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--color-gold) 35%, white), var(--color-gold) 55%, var(--color-gold-dark))',
              boxShadow: '0 5px 12px -3px color-mix(in oklab, var(--color-gold-dark) 70%, black)',
            }}
          />
          <div className="absolute top-[30px] left-1/2 -translate-x-1/2">
            <motion.div
              className="flex origin-top flex-col items-center"
              animate={reduced ? undefined : { rotate: [-8, 8, -8] }}
              transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="h-2.5 w-[3px] rounded-full bg-gold-dark" />
              <motion.div style={{ x: tagShift }}>
                <GapTag gap={gap} leaderColor={leaderColor} reduced={reduced} />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** L'étiquette « +25 pts » (couleur du leader) ou « égalité » (dorée), qui rebondit quand l'écart change. */
function GapTag({ gap, leaderColor, reduced }: { gap: number; leaderColor: string | null; reduced: boolean }) {
  // Fond assombri juste ce qu'il faut pour que l'encre reste lisible (corail, jaune…).
  const lead = leaderColor ? onColor(leaderColor) : null
  return (
    <motion.div
      key={leaderColor ? `${leaderColor}:${gap}` : 'egal'}
      initial={reduced ? false : { scale: 0.5 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 600, damping: 15 }}
      className="rounded-full px-2.5 py-0.5 font-display text-[14px] leading-tight font-bold whitespace-nowrap shadow-[var(--shadow-card)]"
      style={
        lead
          ? { background: lead.bg, color: lead.ink }
          : { background: 'var(--color-gold)', color: 'color-mix(in oklab, var(--color-gold-dark) 35%, black)' }
      }
    >
      {lead ? `+${formatPts(gap)}` : 'égalité'}
    </motion.div>
  )
}

// ─── Les lutteurs ────────────────────────────────────────────────────────────

function Fighter({
  player,
  side,
  standing,
  bounceKey,
  tug,
  reduced,
  calm,
  pulse,
}: {
  player: Player
  side: 'left' | 'right'
  standing: Standing
  bounceKey: string
  tug: TargetAndTransition | undefined
  reduced: boolean
  calm: boolean
  pulse: ArenaPulse | null
}) {
  /** -1 = vers l'extérieur à gauche, +1 = à droite. */
  const out = side === 'left' ? -1 : 1
  // Celui qui mène se penche en arrière, celui qui est mené est tiré vers le milieu.
  const rotate = calm ? 4 * out : standing === 'lead' ? 14 * out : standing === 'trail' ? -7 * out : 8 * out
  const shift = !calm && standing === 'trail' ? -6 * out : 0

  // Rebond de celui qui mène quand les scores changent (pas au premier affichage).
  const controls = useAnimationControls()
  const lastKey = useRef(bounceKey)
  useEffect(() => {
    if (lastKey.current === bounceKey) return
    lastKey.current = bounceKey
    if (reduced || standing === 'trail') return
    void controls.start({
      y: [0, -28, 0, -10, 0],
      scale: [1, 1.12, 0.94, 1.04, 1],
      transition: { duration: 0.8, ease: 'easeOut' },
    })
  }, [bounceKey, standing, reduced, controls])

  const sweaty = !calm && standing !== 'lead'
  const enter: Transition = { ...softSpring, delay: 0.05 }

  return (
    <motion.div
      className="absolute top-[34px] z-10"
      style={{ [side]: FIGHTER_INSET }}
      initial={reduced ? false : { x: 70 * out, opacity: 0 }}
      animate={{ x: shift, opacity: 1 }}
      transition={enter}
    >
      <motion.div
        className="origin-bottom"
        initial={false}
        animate={{ rotate }}
        transition={{ type: 'spring', stiffness: 160, damping: 11 }}
      >
        <motion.div animate={tug}>
          <motion.div animate={controls} className="relative">
            {pulse && (
              <motion.span
                key={`ring-${pulse.key}`}
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ boxShadow: `0 0 0 5px ${player.color}` }}
                initial={{ scale: 1, opacity: 0.9 }}
                animate={{ scale: 2.1, opacity: 0 }}
                transition={{ duration: 1.1, repeat: reduced ? 0 : 2, ease: 'easeOut' }}
              />
            )}
            <Avatar player={player} size="lg" ring />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Ce que l'adversaire vient de faire s'envole au-dessus de sa tête. */}
      {pulse && (
        <motion.span
          key={`emoji-${pulse.key}`}
          className="pointer-events-none absolute -top-3 left-1/2 -ml-4 text-[32px] leading-none"
          initial={{ y: 10, opacity: 0, scale: 0.4 }}
          animate={reduced ? { y: -30, opacity: [0, 1, 1, 0], scale: 1 } : { y: -54, opacity: [0, 1, 1, 0], scale: [0.4, 1.35, 1.1, 1] }}
          transition={{ duration: 2, ease: 'easeOut', times: [0, 0.2, 0.75, 1] }}
        >
          {pulse.emoji}
        </motion.span>
      )}

      {/* 💦 Ça transpire chez celui qui est mené (ou des deux côtés à égalité). */}
      {sweaty && (
        <div className={`pointer-events-none absolute -top-3 ${side === 'left' ? 'right-3' : 'left-3 -scale-x-100'}`}>
          {[0, 0.75].map((delay, i) => (
            <motion.span
              key={i}
              className={`absolute text-[20px] leading-none ${i === 0 ? 'top-0 left-0' : 'top-5 left-3 text-[15px]'}`}
              initial={reduced ? false : { opacity: 0 }}
              animate={reduced ? { opacity: i === 0 ? 1 : 0 } : { opacity: [0, 1, 0], y: [0, -4, 10], x: [0, 4, 8], scale: [0.6, 1, 0.9] }}
              transition={{ duration: 1.5, repeat: Infinity, delay, ease: 'easeOut' }}
            >
              💦
            </motion.span>
          ))}
        </div>
      )}

      {/* 💨 La poussière sous les pieds qui glissent. */}
      {!calm && !reduced && (
        <div className={`pointer-events-none absolute -bottom-2 ${side === 'left' ? 'left-1' : 'right-1 -scale-x-100'}`}>
          <motion.span
            className="block text-[22px] leading-none"
            animate={{ opacity: [0, 0.85, 0], x: [6, -10, -18], scale: [0.5, 1.05, 1.2] }}
            transition={{ duration: 1.1, repeat: Infinity, repeatDelay: standing === 'trail' ? 0.2 : 0.9, ease: 'easeOut' }}
          >
            💨
          </motion.span>
        </div>
      )}
    </motion.div>
  )
}
