/**
 * Petits toasts en haut de l'écran (« 👀 Laetitia vient de faire son check-in »).
 * Purement informatifs : ils laissent passer les taps et ne couvrent jamais le ✕ des feuilles.
 * En maquette (`note`), chaque toast le rappelle : il s'affiche juste par-dessus la pastille
 * 🧪, et c'est précisément le « check-in de Laetitia » inventé qu'on ne doit pas prendre pour
 * le vrai.
 */
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { typo } from '../core/fr'

export interface ToastInput {
  text: string
  /** Couleur d'accent (ex. couleur du joueur). */
  color?: string
  /** Durée d'affichage en ms (défaut 3500). */
  duration?: number
}

interface ToastItem extends ToastInput {
  id: number
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null)

export function ToastProvider({ children, note }: { children: ReactNode; note?: string }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Set<number>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending) window.clearTimeout(t)
      pending.clear()
    }
  }, [])

  const show = useCallback((t: ToastInput) => {
    const id = nextId.current++
    setItems((list) => [...list.slice(-2), { ...t, text: typo(t.text), id }])
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setItems((list) => list.filter((x) => x.id !== id))
    }, t.duration ?? 3500)
    timers.current.add(timer)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Réserve à droite (pr-[72px]) : le ✕ des feuilles (44 px + marge) reste visible et touchable. */}
      <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto flex max-w-md flex-col items-center gap-2 pr-[72px] pl-4">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ y: -40, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -30, opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="pointer-events-none max-w-sm rounded-[22px] bg-surface px-5 py-3 text-center font-display text-[15px] leading-snug font-semibold text-balance text-ink shadow-[var(--shadow-pop)]"
              style={{ borderBottom: `4px solid ${t.color ?? 'var(--color-gold)'}` }}
              role="status"
            >
              {t.text}
              {note && <span className="mt-0.5 block font-body text-[13px] font-bold whitespace-nowrap text-ink-soft">{note}</span>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

/** Affiche un toast : `const toast = useToast(); toast({ text: '…' })`. */
export function useToast(): (t: ToastInput) => void {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>')
  return ctx
}
