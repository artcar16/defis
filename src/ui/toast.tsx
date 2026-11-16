/**
 * Petits toasts en haut de l'écran (« 👀 Laetitia vient de faire son check-in »).
 */
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const show = useCallback((t: ToastInput) => {
    const id = nextId.current++
    setItems((list) => [...list.slice(-2), { ...t, id }])
    window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), t.duration ?? 3500)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ y: -40, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -30, opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="pointer-events-auto max-w-sm rounded-full bg-surface px-5 py-3 font-display text-[15px] font-semibold text-ink shadow-[var(--shadow-pop)]"
              style={{ borderBottom: `4px solid ${t.color ?? 'var(--color-gold)'}` }}
              role="status"
            >
              {t.text}
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
