/**
 * 🎨 Couleurs partagées par les écrans : teintes, encre lisible, contraste.
 * Les écrans importent d'ici au lieu d'avoir chacun leur copie de tint / deep / themeColor.
 */

/** Couleur mélangée à la surface (fond de carte teinté). `base` : ce avec quoi on mélange. */
export function tint(color: string, pct: number, base = 'var(--color-surface)'): string {
  return `color-mix(in oklab, ${color} ${pct}%, ${base})`
}

/** Couleur mélangée à l'encre du thème : lisible en texte, en clair comme en sombre. */
export function deep(color: string, pct = 75): string {
  return `color-mix(in oklab, ${color} ${pct}%, var(--color-ink))`
}

/**
 * Valeur d'un jeton de couleur du thème, lue sur <html> (pour canvas, confettis…).
 * Accepte 'gold', '--color-gold' ou 'var(--color-gold)' ; `fallback` si introuvable.
 */
export function themeColor(token: string, fallback: string): string {
  const name = cssVarName(token)
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
  } catch {
    return fallback
  }
}

/** 'gold' → '--color-gold' ; '--me' et 'var(--me)' → '--me'. */
function cssVarName(token: string): string {
  const t = token.trim()
  const inVar = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(t)
  if (inVar) return inVar[1]
  return t.startsWith('--') ? t : `--color-${t}`
}

// ─── Contraste (WCAG) ────────────────────────────────────────────────────────

type Rgb = [number, number, number]

const WHITE: Rgb = [255, 255, 255]

/** '#abc' ou '#aabbcc' → [r, g, b] (0-255), sinon null. */
export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Rapport de contraste WCAG entre deux couleurs hex (1 à 21). 1 si une couleur est illisible. */
export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return 1
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Mélange avec du noir (k = part de noir, 0-1). */
function darken([r, g, b]: Rgb, k: number): Rgb {
  return [r * (1 - k), g * (1 - k), b * (1 - k)]
}

/** Contraste minimal visé pour le texte des gros boutons (texte large, WCAG AA). */
const MIN_CONTRAST = 3
/** On n'assombrit pas un bouton de plus de 25 % : au-delà, la couleur du joueur ne se reconnaît plus. */
const MAX_DARKEN = 0.25

/**
 * Fond et encre d'un bouton de couleur `hex` :
 * - encre blanche si elle est assez lisible (contraste ≥ 3) ;
 * - sinon le fond est assombri juste assez (jusqu'à 25 % de noir) pour garder l'encre blanche ;
 * - sinon (jaune, or…) le fond reste tel quel et l'encre devient foncée.
 * Une couleur qui n'est pas en hex est rendue telle quelle, avec une encre blanche.
 */
export function onColor(hex: string): { bg: string; ink: string } {
  const rgb = parseHex(hex)
  if (!rgb) return { bg: hex, ink: '#fff' }
  if (contrastRatio(toHex(rgb), '#ffffff') >= MIN_CONTRAST) return { bg: hex, ink: '#fff' }
  for (let step = 1; step <= MAX_DARKEN * 100; step++) {
    const dark = toHex(darken(rgb, step / 100))
    if (contrastRatio(dark, toHex(WHITE)) >= MIN_CONTRAST) return { bg: dark, ink: '#fff' }
  }
  // Encre foncée dans la couleur du bouton (comme ON_GOLD) : 25 % de la couleur, 75 % de noir.
  return { bg: hex, ink: toHex(darken(rgb, 0.75)) }
}

/**
 * Résout une couleur de bouton en hex : '#ff6f61', 'var(--color-nickel)', 'gold'.
 * null si ce n'est pas possible (color-mix…, ou hors navigateur pour un jeton).
 */
export function resolveHex(color: string): string | null {
  if (parseHex(color)) return color.trim()
  const isToken = /^var\(/.test(color.trim()) || /^-?-?[\w-]+$/.test(color.trim())
  if (!isToken) return null
  const v = themeColor(color, '')
  return parseHex(v) ? v : null
}
