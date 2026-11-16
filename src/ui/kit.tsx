/**
 * 🧱 Kit d'interface partagé par tous les écrans.
 * Style « jeu mobile » : gros boutons arrondis, ombres douces, emojis XXL, rebonds.
 */
import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react'
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import type { Player } from '../core/types'
import { onColor, resolveHex } from './color'

/**
 * Variables CSS d'un joueur : --pc (couleur), --pc-btn / --pc-ink (fond et encre lisibles
 * d'un bouton à sa couleur), à utiliser via bg-[var(--pc)] etc.
 */
export function playerStyle(player: Pick<Player, 'color'>): CSSProperties {
  const { bg, ink } = onColor(player.color)
  return {
    ['--pc' as string]: player.color,
    ['--pc-btn' as string]: bg,
    ['--pc-ink' as string]: ink,
    ['--btn' as string]: bg,
  } as CSSProperties
}

/**
 * Fond et encre d'un bouton de couleur `color` (hex ou jeton du thème) : encre blanche
 * lisible, fond assombri si besoin, ou encre foncée sur les couleurs trop claires.
 */
export function buttonColors(color: string, ink?: string): CSSProperties {
  const hex = resolveHex(color)
  const c = hex ? onColor(hex) : { bg: color, ink: '#fff' }
  return { ['--btn' as string]: c.bg, ['--btn-ink' as string]: ink ?? c.ink } as CSSProperties
}

/** Ressort « rebond » standard pour les animations Motion. */
export const springy = { type: 'spring', stiffness: 520, damping: 22 } as const
export const softSpring = { type: 'spring', stiffness: 260, damping: 24 } as const

// ─── Bouton ──────────────────────────────────────────────────────────────────

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  children: ReactNode
  /** 'primary' = couleur (du joueur par défaut), 'soft' = fond carte. */
  variant?: 'primary' | 'soft'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /**
   * Couleur du bouton, hex ou jeton (`var(--color-nickel)`) ; sinon couleur du joueur connecté.
   * L'encre (blanche ou foncée) et un léger assombrissement sont choisis pour rester lisibles.
   */
  color?: string
  /** Encre imposée (sinon calculée d'après `color`). */
  ink?: string
  block?: boolean
}

// py-2 : un libellé qui passe sur 2 lignes garde de l'air en haut et en bas.
const SIZES = {
  sm: 'min-h-10 px-4 py-2 text-[15px]',
  md: 'min-h-12 px-5 py-2 text-[17px]',
  lg: 'min-h-14 px-6 py-2 text-xl',
  xl: 'min-h-[72px] px-7 py-2 text-2xl',
}

/** Gros bouton arrondi façon jeu, qui s'écrase au tap. */
export function Button({ children, variant = 'primary', size = 'md', color, ink, block, className = '', style, ...rest }: ButtonProps) {
  const colors = color ? buttonColors(color, ink) : ink ? { ['--btn-ink' as string]: ink } : {}
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      transition={springy}
      className={`btn-chunky ${variant === 'soft' ? 'btn-soft' : ''} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      style={{ ...colors, ...style }}
      {...rest}
    >
      {children}
    </motion.button>
  )
}

// ─── Carte ───────────────────────────────────────────────────────────────────

export function Card({ children, className = '', style, ...rest }: HTMLMotionProps<'div'> & { children: ReactNode }) {
  return (
    <motion.div className={`card p-4 ${className}`} style={style} {...rest}>
      {children}
    </motion.div>
  )
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

const AVATAR_SIZES = { xs: 'size-7 text-base', sm: 'size-10 text-xl', md: 'size-14 text-3xl', lg: 'size-20 text-5xl', xl: 'size-28 text-7xl' }

/** Avatar emoji dans un rond de la couleur du joueur. */
export function Avatar({
  player,
  size = 'md',
  className = '',
  ring = false,
}: {
  player: Pick<Player, 'emoji' | 'color' | 'name'>
  size?: keyof typeof AVATAR_SIZES
  className?: string
  /** Anneau blanc épais (pour le Ring). */
  ring?: boolean
}) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full leading-none ${AVATAR_SIZES[size]} ${ring ? 'ring-4 ring-surface' : ''} ${className}`}
      style={{
        background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${player.color} 55%, white), ${player.color})`,
        boxShadow: `0 6px 0 color-mix(in oklab, ${player.color} 65%, black), 0 12px 24px -10px ${player.color}`,
      }}
      aria-label={player.name}
      role="img"
    >
      <span className="translate-y-[2%]">{player.emoji}</span>
    </div>
  )
}

// ─── Titres ──────────────────────────────────────────────────────────────────

export function ScreenHeader({ title, emoji, subtitle, right }: { title: string; emoji?: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight text-ink">
          {emoji && <span className="mr-2">{emoji}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[15px] font-semibold text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-6 mb-2.5 flex items-center justify-between px-1">
      <h2 className="font-display text-lg font-semibold text-ink-soft">{children}</h2>
      {right}
    </div>
  )
}

/** Petite pastille arrondie (statut, info). */
export function Pill({ children, color, className = '' }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-bold ${className}`}
      style={
        color
          ? { background: `color-mix(in oklab, ${color} 16%, transparent)`, color: `color-mix(in oklab, ${color} 80%, var(--color-ink))` }
          : { background: 'var(--color-sunken)', color: 'var(--color-ink-soft)' }
      }
    >
      {children}
    </span>
  )
}

// ─── Barre de progression ────────────────────────────────────────────────────

export function ProgressBar({
  value,
  max,
  color,
  track,
  className = '',
}: {
  value: number
  max: number
  color: string
  /** Couleur de la piste (défaut : fond creusé du thème). */
  track?: string
  className?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`h-3 overflow-hidden rounded-full ${track ? '' : 'bg-sunken'} ${className}`} style={track ? { background: track } : undefined}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={softSpring}
      />
    </div>
  )
}

// ─── Feuille plein écran (pesée, résultats) ──────────────────────────────────

/** Feuille qui monte du bas, plein écran, avec bouton fermer. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  tone,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** Couleur d'ambiance du haut de la feuille. */
  tone?: string
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Échap ferme la feuille, sauf si un champ l'a déjà traité (ex. annuler une saisie de poids).
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-bg app-bg"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          role="dialog"
          aria-modal="true"
          style={
            tone
              ? {
                  // Le dégradé d'ambiance par-dessus les pois de .app-bg (sans se répéter en tuiles de 22 px).
                  backgroundImage: `linear-gradient(180deg, color-mix(in oklab, ${tone} 22%, transparent), transparent 320px), radial-gradient(color-mix(in oklab, var(--color-ink) 5%, transparent) 1.2px, transparent 1.3px)`,
                  backgroundSize: 'auto, 22px 22px',
                }
              : undefined
          }
        >
          <div className="safe-top sticky top-0 z-10 mx-auto flex w-full max-w-md items-center justify-between bg-bg/85 px-4 pb-2 backdrop-blur-md">
            <div className="font-display text-xl font-semibold">{title}</div>
            <motion.button
              type="button"
              onClick={onClose}
              whileTap={{ scale: 0.85 }}
              className="grid size-11 place-items-center rounded-full bg-surface text-xl font-bold text-ink shadow-[var(--shadow-card)]"
              aria-label="Fermer"
            >
              ✕
            </motion.button>
          </div>
          {/* Barre d'accueil de l'iPhone + 24 px d'air sous le dernier bouton. */}
          <div className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Petits utilitaires ──────────────────────────────────────────────────────

/** Nombre animé (compteur qui monte). */
export function AnimatedNumber({ value, className = '', style }: { value: number; className?: string; style?: CSSProperties }) {
  return (
    <motion.span
      key={value}
      className={`score-num inline-block ${className}`}
      style={style}
      initial={{ y: -8, scale: 1.25, opacity: 0.4 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      transition={springy}
    >
      {value}
    </motion.span>
  )
}

/** Couleur associée à une réponse de check-in (calendriers, boutons). */
export const VALUE_COLORS: Record<string, string> = {
  nickel: 'var(--color-nickel)',
  fait: 'var(--color-nickel)',
  unpeu: 'var(--color-unpeu)',
  craquage: 'var(--color-craquage)',
  pasfait: 'var(--color-craquage)',
}

/** Libellés et emojis des réponses. */
export const VALUE_LABELS: Record<string, { emoji: string; label: string }> = {
  nickel: { emoji: '😇', label: 'Nickel' },
  unpeu: { emoji: '😬', label: 'Un peu' },
  craquage: { emoji: '🙈', label: 'Craquage' },
  fait: { emoji: '💪', label: 'Fait' },
  pasfait: { emoji: '🛋️', label: 'Pas fait' },
}
