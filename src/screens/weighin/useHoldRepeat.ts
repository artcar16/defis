/**
 * Appui long qui accélère : un pas au tap, puis ça défile de plus en plus vite
 * tant qu'on garde le doigt dessus (et par pas de 5 au bout d'un moment).
 */
import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'

const FIRST_DELAY = 420
const START_INTERVAL = 170
const MIN_INTERVAL = 40
const SPEED_UP = 0.88
/** Après ce nombre de répétitions, chaque pas compte ×5. */
const BIG_STEP_AFTER = 30
const BIG_STEP = 5

export function useHoldRepeat(onStep: (multiplier: number) => void) {
  const stepRef = useRef(onStep)
  useEffect(() => {
    stepRef.current = onStep
  }, [onStep])

  const timer = useRef<number | null>(null)
  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }, [])

  const start = useCallback(() => {
    stop()
    let count = 0
    stepRef.current(1)
    const tick = () => {
      count++
      stepRef.current(count > BIG_STEP_AFTER ? BIG_STEP : 1)
      timer.current = window.setTimeout(tick, Math.max(MIN_INTERVAL, START_INTERVAL * SPEED_UP ** count))
    }
    timer.current = window.setTimeout(tick, FIRST_DELAY)
  }, [stop])

  useEffect(() => stop, [stop])

  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // pas grave : on arrête aussi au pointerleave
      }
      start()
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
    onBlur: stop,
    // Clavier (Entrée / Espace) : le clic arrive sans pointerdown (detail === 0).
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      if (e.detail === 0) stepRef.current(1)
    },
    onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') stop()
    },
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
  }
}
