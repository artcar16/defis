/**
 * Petites briques des réglages : section en carte, interrupteur, champ texte,
 * grille d'emojis, dépliant, et un hook pour lancer une action avec toast.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useId, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import { springy } from '../../ui/kit'
import { useToast, type ToastInput } from '../../ui/toast'
import { errorText, tint } from './format'

// ─── Action + toast ──────────────────────────────────────────────────────────

/**
 * Lance une action de la source : toast de confirmation si ça marche,
 * toast d'erreur (message français de la source) sinon. Renvoie true si OK.
 */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async (fn: () => Promise<void>, success?: string | ToastInput): Promise<boolean> => {
      setBusy(true)
      try {
        await fn()
        if (success) toast(typeof success === 'string' ? { text: success } : success)
        return true
      } catch (e) {
        toast({ text: errorText(e), color: 'var(--color-craquage)', duration: 4500 })
        return false
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )
  return { run, busy }
}

// ─── Section ─────────────────────────────────────────────────────────────────

export function Section({
  id,
  emoji,
  title,
  subtitle,
  right,
  index = 0,
  children,
  className = '',
  style,
}: {
  id?: string
  emoji: string
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  /** Rang d'apparition (cascade). */
  index?: number
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const reduced = useReducedMotion() ?? false
  const headingId = useId()
  return (
    <motion.section
      id={id}
      aria-labelledby={headingId}
      className={`card mt-4 scroll-mt-4 p-4 ${className}`}
      style={style}
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, delay: Math.min(index, 8) * 0.05 }}
    >
      <header className="mb-3 flex items-start gap-3">
        <motion.span
          className="mt-0.5 shrink-0 text-[34px] leading-none"
          aria-hidden="true"
          whileTap={reduced ? undefined : { rotate: [0, -16, 12, 0], scale: 1.2 }}
        >
          {emoji}
        </motion.span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-display text-[21px] leading-tight font-bold text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[15px] leading-snug font-semibold text-muted">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </motion.section>
  )
}

/** Petit titre à l'intérieur d'une section. */
export function Label({ children, htmlFor, right }: { children: ReactNode; htmlFor?: string; right?: ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 flex items-center justify-between gap-2 px-1">
      <label htmlFor={htmlFor} className="font-display text-[15px] font-semibold tracking-wide text-ink-soft">
        {children}
      </label>
      {right}
    </div>
  )
}

// ─── Champ texte ─────────────────────────────────────────────────────────────

export const INPUT_CLASS =
  'min-h-12 w-full rounded-2xl border-2 border-transparent bg-sunken px-4 py-2.5 font-semibold text-ink placeholder:font-medium placeholder:text-muted outline-none transition-colors focus:border-[color:var(--me)] focus:bg-surface'

export function TextField({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${INPUT_CLASS} ${className}`} {...rest} />
}

// ─── Interrupteur ────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
  description,
  color = 'var(--me)',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  color?: string
}) {
  const reduced = useReducedMotion() ?? false
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-sunken px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[17px] leading-snug font-semibold text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[15px] leading-snug text-muted">{description}</span>}
      </span>
      <span
        className="relative flex h-8 w-[52px] shrink-0 items-center rounded-full p-1 transition-colors"
        style={{ background: checked ? color : 'var(--color-line)', justifyContent: checked ? 'flex-end' : 'flex-start' }}
        aria-hidden="true"
      >
        <motion.span
          layout
          transition={reduced ? { duration: 0 } : springy}
          className="grid size-6 place-items-center rounded-full bg-surface text-[13px] shadow-[0_2px_4px_rgb(0_0_0/0.2)]"
        >
          {checked ? '👀' : '🤫'}
        </motion.span>
      </span>
    </button>
  )
}

// ─── Grille d'emojis ─────────────────────────────────────────────────────────

export function EmojiGrid({
  emojis,
  value,
  onPick,
  color = 'var(--me)',
  label,
  taken,
}: {
  emojis: string[]
  value: string
  onPick: (emoji: string) => void
  color?: string
  label: string
  /** Emoji déjà pris (par l'autre joueur) : marqué, mais le clic reste géré par onPick. */
  taken?: { emoji: string; color: string; by: string }
}) {
  const reduced = useReducedMotion() ?? false
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap justify-center gap-1.5">
      {emojis.map((e) => {
        const active = e === value
        const isTaken = taken?.emoji === e && !active
        return (
          <motion.button
            key={e}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={isTaken ? `${e} (déjà pris par ${taken.by})` : e}
            onClick={() => onPick(e)}
            whileTap={reduced ? undefined : { scale: 0.82, rotate: -8 }}
            animate={active && !reduced ? { scale: [1, 1.18, 1] } : { scale: 1 }}
            transition={springy}
            className="relative grid size-[49px] place-items-center rounded-2xl text-[28px] leading-none"
            style={{
              background: active ? tint(color, 22) : 'var(--color-sunken)',
              boxShadow: `inset 0 0 0 3px ${active ? color : 'transparent'}`,
              opacity: isTaken ? 0.45 : 1,
            }}
          >
            <span aria-hidden="true">{e}</span>
            {isTaken && (
              <span
                className="absolute -top-1 -right-1 size-4 rounded-full ring-2 ring-surface"
                style={{ background: taken.color }}
                aria-hidden="true"
              />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Puces / segments ────────────────────────────────────────────────────────

/** Choix exclusif en grosses pastilles (type d'habitude…). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  color = 'var(--me)',
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  label: string
  color?: string
}) {
  const reduced = useReducedMotion() ?? false
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-full bg-sunken p-1.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <motion.button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            whileTap={reduced ? undefined : { scale: 0.95 }}
            className={`relative min-h-12 rounded-full px-3 font-display text-[16px] font-semibold ${active ? 'text-ink' : 'text-ink-soft'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface"
                style={{ boxShadow: `0 3px 0 ${tint(color, 45, 'var(--color-line)')}, var(--shadow-card)` }}
                transition={reduced ? { duration: 0 } : springy}
              />
            )}
            <span className="relative">{o.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Dépliant ────────────────────────────────────────────────────────────────

export function Collapsible({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const reduced = useReducedMotion() ?? false
  const id = useId()
  return (
    <div className="mt-3 rounded-3xl bg-sunken">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-14 w-full items-center gap-2 px-4 text-left font-display text-[16px] font-semibold text-ink-soft"
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : springy}
          className="text-[18px] text-muted"
          aria-hidden="true"
        >
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Petite note explicative (règle du jeu). */
export function Note({ children, emoji = '💡' }: { children: ReactNode; emoji?: string }) {
  return (
    <p className="mt-3 flex gap-2 rounded-2xl bg-sunken px-3 py-2.5 text-[15px] leading-snug text-ink-soft">
      <span aria-hidden="true">{emoji}</span>
      <span>{children}</span>
    </p>
  )
}

/** Statut en ligne (en attente, à venir…), avec bouton d'action optionnel. */
export function StatusLine({
  emoji,
  children,
  color = 'var(--color-muted)',
  action,
}: {
  emoji: string
  children: ReactNode
  color?: string
  action?: ReactNode
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mt-3 flex min-h-12 items-center gap-2.5 rounded-2xl px-3 py-2"
      style={{ background: tint(color, 14), boxShadow: `inset 0 0 0 2px ${tint(color, 28, 'transparent')}` }}
    >
      <span className="text-[22px] leading-none" aria-hidden="true">
        {emoji}
      </span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold text-ink">{children}</span>
      {action}
    </motion.div>
  )
}

/** Petit bouton texte secondaire (Annuler, Modifier…). */
export function MiniButton({
  children,
  onClick,
  disabled,
  ariaLabel,
  tone = 'neutral',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  ariaLabel?: string
  tone?: 'neutral' | 'danger'
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileTap={{ scale: 0.92 }}
      className="min-h-12 shrink-0 rounded-2xl bg-surface px-3.5 font-display text-[15px] font-semibold shadow-[0_3px_0_var(--color-line)] disabled:opacity-50"
      style={{ color: tone === 'danger' ? 'var(--color-craquage)' : 'var(--color-ink-soft)' }}
    >
      {children}
    </motion.button>
  )
}
