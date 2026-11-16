/**
 * Confettis (canvas-confetti), aux couleurs des joueurs.
 */
import confetti from 'canvas-confetti'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Petite explosion depuis un point (0-1 de l'écran). */
export function burst(colors: string[], origin: { x: number; y: number } = { x: 0.5, y: 0.6 }) {
  if (reduced()) return
  void confetti({ particleCount: 90, spread: 75, startVelocity: 42, origin, colors, scalar: 1.05, ticks: 220, zIndex: 80 })
}

/** Grande fête : deux canons sur les côtés (journée parfaite, victoire). */
export function celebrate(colors: string[]) {
  if (reduced()) return
  const end = Date.now() + 900
  const frame = () => {
    void confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors, zIndex: 80 })
    void confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors, zIndex: 80 })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}

/** Pluie d'emojis (ex. 👑) — utilise les formes texte de canvas-confetti. */
export function emojiRain(emoji: string, colors: string[] = []) {
  if (reduced()) return
  try {
    const shape = confetti.shapeFromText({ text: emoji, scalar: 2.2 })
    void confetti({ shapes: [shape], scalar: 2.2, particleCount: 24, spread: 100, startVelocity: 35, origin: { x: 0.5, y: 0.3 }, zIndex: 80, ticks: 260 })
  } catch {
    burst(colors)
  }
}
