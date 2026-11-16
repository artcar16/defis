/**
 * Calque plein écran rendu dans <body> (au-dessus de la barre d'onglets, et hors
 * des conteneurs animés de l'écran), avec blocage du défilement et touche Échap.
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

/** Bloque le défilement de la page et écoute Échap tant que `active`. */
export function useModalBehavior(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [active, onEscape])
}
