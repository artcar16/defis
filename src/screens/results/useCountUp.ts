/**
 * Compteur qui monte de 0 à `target` en `duration` ms quand `running` passe à vrai.
 */
import { useEffect, useState } from 'react'

export function useCountUp(target: number, running: boolean, duration: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!running) return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = duration <= 0 ? 1 : Math.min(1, (t - t0) / duration)
      // Démarrage franc, petite décélération sur la fin (suspense !).
      const eased = 1 - (1 - p) ** 2
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, running, duration])
  return value
}
